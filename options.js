document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const status = $('status-msg');
  const keyFields = { gemini:'key-gemini', groq:'key-groq', openrouter:'key-openrouter', mistral:'key-mistral' };
  const MODELS = [
    {id:'gemini-3.1-flash-lite',provider:'gemini',name:'Gemini 3.1 Flash-Lite',note:'Google · primary model'},
    {id:'gemini-flash-latest',provider:'gemini',name:'Gemini Flash Latest',note:'Google · rolling latest fallback'},
    {id:'openai/gpt-oss-120b',provider:'groq',name:'GPT-OSS 120B',note:'Groq · free tier'},
    {id:'qwen/qwen3.8-27b',provider:'groq',name:'Qwen 3.8 27B',note:'Groq · free tier'},
    {id:'openai/gpt-oss-20b',provider:'groq',name:'GPT-OSS 20B',note:'Groq · free tier'},
    {id:'google/gemma-4-26b-a4b-it:free',provider:'openrouter',name:'Gemma 4 26B A4B',note:'OpenRouter · free route'},
    {id:'nvidia/nemotron-3.5-lightning:free',provider:'openrouter',name:'Nemotron 3.5 Lightning',note:'OpenRouter · free route'},
    {id:'cohere/north-mini-code:free',provider:'openrouter',name:'North Mini Code',note:'OpenRouter · free route'},
    {id:'ministral-8b-latest',provider:'mistral',name:'Ministral 8B',note:'Mistral · account access may vary'}
  ];
  let order = MODELS.map(x => x.id);
  let enabled = new Set(order);
  function show(message, error=false){status.textContent=message;status.className=error?'status-error':'status-success';status.style.display='block';}
  function render(){
    const host=$('model-list');host.replaceChildren();
    order.forEach((id,index)=>{
      const model=MODELS.find(x=>x.id===id);if(!model)return;
      const row=document.createElement('div');row.className='model-row'+(enabled.has(id)?'':' disabled');
      const check=document.createElement('input');check.type='checkbox';check.checked=enabled.has(id);check.title='Enable model';check.addEventListener('change',()=>{check.checked?enabled.add(id):enabled.delete(id);render();});
      const details=document.createElement('div');const name=document.createElement('div');name.className='model-name';name.textContent=model.name;const meta=document.createElement('div');meta.className='model-meta';meta.textContent=model.note+' · '+model.id;details.append(name,meta);
      const actions=document.createElement('div');actions.className='model-actions';
      for(const [label,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=index+delta<0||index+delta>=order.length;b.title=delta<0?'Move up':'Move down';b.addEventListener('click',()=>{const target=index+delta;[order[index],order[target]]=[order[target],order[index]];render();});actions.append(b);}
      row.append(check,details,actions);host.append(row);
    });
  }
  const saved=await chrome.storage.sync.get({geminiApiKey:'',providerKeys:{},customPrompt:'',videoSpeed:16,modelPriority:[]});
  $('key-gemini').value=saved.geminiApiKey||saved.providerKeys?.gemini||'';
  for(const provider of ['groq','openrouter','mistral'])$(keyFields[provider]).value=saved.providerKeys?.[provider]||'';
  $('customPrompt').value=saved.customPrompt||'';
  $('videoSpeed').value=saved.videoSpeed||16;
  if(Array.isArray(saved.modelPriority)&&saved.modelPriority.length){
    const valid=saved.modelPriority.filter(id=>MODELS.some(m=>m.id===id));
    order=[...valid,...MODELS.map(m=>m.id).filter(id=>!valid.includes(id))];
  }
  if(Array.isArray(saved.disabledModels))enabled=new Set(order.filter(id=>!saved.disabledModels.includes(id)));
  render();
  if(!$('customPrompt').value)fetch(chrome.runtime.getURL('prompt.txt')).then(r=>r.text()).then(t=>{if(!$('customPrompt').value)$('customPrompt').value=t;}).catch(()=>{});
  $('save-btn').onclick=async()=>{
    const providerKeys={};for(const p of Object.keys(keyFields))providerKeys[p]=$(keyFields[p]).value.trim();
    await chrome.storage.sync.set({geminiApiKey:providerKeys.gemini,providerKeys,modelPriority:order,disabledModels:order.filter(id=>!enabled.has(id)),customPrompt:$('customPrompt').value,videoSpeed:Math.min(16,Math.max(1,Number($('videoSpeed').value)||16))});
    show('Settings saved. Enabled models will be tried in the displayed order.');
  };
  $('test-btn').onclick=async()=>{
    $('test-btn').disabled=true;show('Testing enabled model endpoints…');
    try{
      const keys={};for(const p of Object.keys(keyFields))keys[p]=$(keyFields[p]).value.trim();
      const active=order.map(id=>MODELS.find(m=>m.id===id)).filter(m=>enabled.has(m.id)&&keys[m.provider]);
      if(!active.length)throw new Error('Enable at least one model and enter its provider API key.');
      const results=[];
      for(const m of active){
        try{
          let url,headers={};
          if(m.provider==='gemini'){url='https://generativelanguage.googleapis.com/v1beta/models/'+m.id+'?key='+encodeURIComponent(keys.gemini);}
          else if(m.provider==='groq'){url='https://api.groq.com/openai/v1/models/'+encodeURIComponent(m.id);headers.Authorization='Bearer '+keys.groq;}
          else if(m.provider==='openrouter'){url='https://openrouter.ai/api/v1/models';headers.Authorization='Bearer '+keys.openrouter;}
          else{url='https://api.mistral.ai/v1/models';headers.Authorization='Bearer '+keys.mistral;}
          const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
          results.push(m.name+': '+(r.ok?'reachable':'HTTP '+r.status));
        }catch(e){results.push(m.name+': '+e.message);}
      }
      show(results.join(' | '),results.every(x=>!x.includes('reachable')));
    }catch(e){show(e.message,true);}finally{$('test-btn').disabled=false;}
  };
});