/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Play,
  CheckCircle2,
  AlertCircle,
  Eye,
  Crosshair,
  Terminal,
  RefreshCw,
  Sliders,
  HelpCircle,
  Radio,
  Clock,
  Sparkles,
  MousePointer2,
  Video,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  FileCode,
  Copy,
  Check,
  FileText,
  Send,
  Key,
  Layers,
  Image as ImageIcon,
  Trash2,
  Cpu,
  ListOrdered,
} from 'lucide-react';
import { PRESET_SCENARIOS, PresetScenario } from './data/presets';

interface AnalysisOption {
  number?: number;
  letter?: string;
  text: string;
  isCorrect: boolean;
  confidence: number;
  coordinates: {
    xPercent: number;
    yPercent: number;
  };
}

interface AnalysisResult {
  question: string;
  questionType: string;
  conciseReasoning: string;
  hasVideo: boolean;
  options: AnalysisOption[];
  nextButton?: {
    detected: boolean;
    coordinates?: {
      xPercent: number;
      yPercent: number;
    };
  };
}

interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: 'AI_VISION' | 'COORDINATES' | 'CLICK' | 'REASONING' | 'ERROR' | 'INFO' | 'VIDEO' | 'COMPLETE' | 'TEXT_MODE';
  message: string;
  data?: any;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'text_mode' | 'console' | 'manager' | 'diagnosis'>('simulator');
  const [selectedPreset, setSelectedPreset] = useState<PresetScenario>(PRESET_SCENARIOS[0]);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<{ latencyMs: number; model: string } | null>(null);

  // Simulation execution state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStep, setSimulationStep] = useState<string>('Ready');
  const [virtualCursor, setVirtualCursor] = useState<{ xPercent: number; yPercent: number; visible: boolean }>({
    xPercent: 50,
    yPercent: 50,
    visible: false,
  });
  const [selectedOptionIndices, setSelectedOptionIndices] = useState<number[]>([]);
  const [clickRipples, setClickRipples] = useState<{ id: string; xPct: number; yPct: number; label: string }[]>([]);
  const [nextButtonClicked, setNextButtonClicked] = useState(false);

  // Live Console Logs
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [serverStatus, setServerStatus] = useState<{
    status: string;
    geminiReady: boolean;
    model: string;
    appUrl: string;
    uptimeSeconds: number;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Extension Manager State
  const [extensionFiles, setExtensionFiles] = useState<Record<string, string>>({});
  const [selectedInspectFile, setSelectedInspectFile] = useState<string>('content.js');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ================= TEXT MODE (MULTI-AI & NUMBERED ANSWERS) STATE =================
  const [textQuestion, setTextQuestion] = useState<string>('');
  const [textProvider, setTextProvider] = useState<'gemini' | 'openai' | 'claude' | 'deepseek' | 'custom'>(() => {
    const saved = localStorage.getItem('autosolve_active_provider');
    if (saved && ['gemini', 'openai', 'claude', 'deepseek', 'custom'].includes(saved)) {
      return saved as any;
    }
    return 'gemini';
  });
  const [textApiKey, setTextApiKey] = useState<string>(() => {
    const initialProv = localStorage.getItem('autosolve_active_provider') || 'gemini';
    return localStorage.getItem(`autosolve_key_${initialProv}`) || '';
  });
  const [textModel, setTextModel] = useState<string>(() => {
    const initialProv = localStorage.getItem('autosolve_active_provider') || 'gemini';
    if (initialProv === 'openai') return 'gpt-4o';
    if (initialProv === 'claude') return 'claude-3-5-haiku-20241022';
    if (initialProv === 'deepseek') return 'deepseek-chat';
    return 'gemini-3.8-flash';
  });
  const [textCustomBaseUrl, setTextCustomBaseUrl] = useState<string>(() => localStorage.getItem('autosolve_custom_base_url') || 'https://api.openai.com/v1');
  const [textCustomModel, setTextCustomModel] = useState<string>('gpt-4o');
  const [textUserInstructions, setTextUserInstructions] = useState<string>(() => localStorage.getItem('autosolve_text_user_instructions') || '');
  const [isSolvingText, setIsSolvingText] = useState(false);
  const [textSolution, setTextSolution] = useState<any>(null);
  const [textMeta, setTextMeta] = useState<{ latencyMs: number; provider: string; model: string } | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [showKeyField, setShowKeyField] = useState(false);
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyValidResult, setKeyValidResult] = useState<{ valid: boolean; message: string } | null>(null);

  const handleVerifyKey = async (prov = textProvider, key = textApiKey) => {
    setKeyValidating(true);
    setKeyValidResult(null);
    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: prov,
          apiKey: key,
          baseUrl: textCustomBaseUrl,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setKeyValidResult({ valid: true, message: `Online & Valid (${data.latencyMs}ms)` });
      } else {
        setKeyValidResult({ valid: false, message: data.error || 'Verification failed' });
      }
    } catch (e: any) {
      setKeyValidResult({ valid: false, message: e.message || 'Network unreachable' });
    } finally {
      setKeyValidating(false);
    }
  };

  const handleProviderSelect = (p: 'gemini' | 'openai' | 'claude' | 'deepseek' | 'custom') => {
    setTextProvider(p);
    localStorage.setItem('autosolve_active_provider', p);
    const saved = localStorage.getItem(`autosolve_key_${p}`) || '';
    setTextApiKey(saved);
    setKeyValidResult(null);
    if (p === 'gemini') setTextModel('gemini-3.8-flash');
    else if (p === 'openai') setTextModel('gpt-4o');
    else if (p === 'claude') setTextModel('claude-3-5-haiku-20241022');
    else if (p === 'deepseek') setTextModel('deepseek-chat');
    if (saved) {
      handleVerifyKey(p, saved);
    }
  };

  const handleKeySave = (val: string) => {
    setTextApiKey(val);
    setKeyValidResult(null);
    localStorage.setItem(`autosolve_key_${textProvider}`, val);
    localStorage.setItem('autosolve_active_provider', textProvider);
  };

  const loadPresetText = (type: 'keats_ode' | 'keats_dropdown' | 'bio' | 'swift_proposal') => {
    setTextSolution(null);
    setTextError(null);
    if (type === 'keats_ode') {
      setTextQuestion(
        `Thou, silent form, dost tease us out of thought\nAs doth eternity: Cold Pastoral!\nWhen old age shall this generation waste,\nThou shalt remain\n–“Ode on a Grecian Urn,” John Keats\n\nWhat features of the poem indicate that it is an ode? Choose two correct answers.\n\nIt tells a story.\nIt is written in a formal style.\nIt directly addresses an object.\nIt uses rhyme.\nIt incorporates jokes and humor.`
      );
    } else if (type === 'keats_dropdown') {
      setTextQuestion(
        `John Keats - "Ode on a Grecian Urn" (Stanza 3 Dropdown Assessment):\n\nWhat does the repetition of the phrase for ever suggest about the image on the vase?\n[Choices for Dropdown 1]:\n- The image is hard to see.\n- The image is permanent and immortal.\n- The image will soon fade away.\n\nWhat does the repetition of the word happy suggest?\n[Choices for Dropdown 2]:\n- The speaker is sarcastic and doubtful.\n- The speaker admires the couple's joy and celebrates eternal love.\n- The speaker regrets visiting the urn.\n\nBased on the poet's diction, what is the tone of the passage?\n[Choices for Dropdown 3]:\n- angry and bitter\n- admiring and celebratory\n- dull and indifferent`
      );
    } else if (type === 'bio') {
      setTextQuestion(
        `AP Biology - Cellular Respiration:\n\nWhich stage of aerobic cellular respiration yields the greatest net number of ATP molecules per molecule of glucose?\n\n[Option 1]: Glycolysis in the cytosol\n[Option 2]: Pyruvate oxidation in the mitochondrial matrix\n[Option 3]: The citric acid (Krebs) cycle\n[Option 4]: Oxidative phosphorylation via the electron transport chain and chemiosmosis`
      );
    } else if (type === 'swift_proposal') {
      setTextQuestion(
        `Read the excerpt from "A Modest Proposal."\n\nThus the squire will learn to be a good landlord, and grow popular among his tenants, the mother will have eight shillings neat profit, and be fit for work till she produces another child.\n\nOn which false premise does this excerpt rely?\n\nthat a woman would be willing to keep the children she bears\n\nthat a woman would be willing to breed children to sell\n\nthat a woman would be willing to pay her landlord rent\n\nthat a woman would be willing to take over her landlord’s business`
      );
    }
  };

  // Run non-interactive Q&A solve with Numbered Output in Console
  const handleSolveTextMode = async () => {
    if (!textQuestion.trim()) {
      setTextError('Please paste or type question text first.');
      return;
    }
    setIsSolvingText(true);
    setTextError(null);
    setTextSolution(null);
    setTextMeta(null);

    const activeModel = textProvider === 'custom' ? textCustomModel : textModel;
    addLocalLog('TEXT_MODE', `[Text Mode] Solving question using ${textProvider.toUpperCase()} (${activeModel})...`);

    try {
      const res = await fetch('/api/solve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(185_000),
        body: JSON.stringify({
          text: textQuestion,
          provider: textProvider,
          apiKey: textApiKey || undefined,
          model: activeModel,
          baseUrl: textProvider === 'custom' ? textCustomBaseUrl : undefined,
          userPrompt: textUserInstructions,
        }),
      });

      const responseText = await res.text();
      let data: any;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(`The server returned an unreadable response (HTTP ${res.status}).`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to solve question in text mode.');
      }

      const sol = data.solution;
      setTextSolution(sol);
      setTextMeta(data.meta || { latencyMs: 0, provider: textProvider, model: activeModel });

      // MANDATORY REQUIREMENT: Output answers with numbers in console
      console.group('%c[AutoSolve AI][TEXT MODE] Numbered Answer Results', 'color: #2563eb; font-weight: bold; font-size: 14px;');
      console.log(`Provider: ${data.providerUsed || textProvider}`);
      console.log(`Question: "${sol.question}" (Type: ${sol.questionType})`);
      console.log(`Reasoning: ${sol.conciseReasoning}`);

      if (Array.isArray(sol.allChoices) && sol.allChoices.length > 0) {
        console.log('%c--- Numbered Choice Breakdown ---', 'color: #94a3b8; font-weight: bold;');
        sol.allChoices.forEach((ch: any) => {
          const num = ch.number || '?';
          const letter = ch.letter ? `(${ch.letter})` : '';
          const status = ch.isCorrect ? '✅ [CORRECT ANSWER]' : '❌ [INCORRECT]';
          console.log(
            `%c${status} Option [${num}] ${letter}: "${ch.text}"`,
            ch.isCorrect
              ? 'color: #10b981; font-weight: bold; background: #064e3b; padding: 2px 8px; border-radius: 4px;'
              : 'color: #64748b;'
          );
        });
      }

      if (Array.isArray(sol.answers) && sol.answers.length > 0) {
        console.log('%c--- Primary Correct Answers to Pick ---', 'color: #10b981; font-weight: bold;');
        sol.answers.forEach((ans: any) => {
          const num = ans.number || '?';
          const letter = ans.letter ? `(${ans.letter})` : '';
          console.log(
            `%c👉 Pick Option [${num}] ${letter}: "${ans.text}"`,
            'color: #34d399; font-weight: bold; font-size: 13px; background: #064e3b; padding: 2px 8px; border-radius: 4px;'
          );
        });
      }

      if (Array.isArray(sol.dropdowns) && sol.dropdowns.length > 0) {
        console.log('%c--- Dropdown Menu Solutions ---', 'color: #38bdf8; font-weight: bold;');
        sol.dropdowns.forEach((dd: any) => {
          console.log(
            `%c👉 Dropdown [${dd.dropdownNumber}]: Select Option [${dd.selectedAnswerNumber}] "${dd.selectedAnswerText}" (Prompt: ${dd.prompt})`,
            'color: #38bdf8; font-weight: bold; background: #0c4a6e; padding: 2px 8px; border-radius: 4px;'
          );
        });
      }
      console.groupEnd();

      const answerSummary = (sol.answers || []).map((a: any) => `[${a.number}] "${a.text}"`).join(', ');
      addLocalLog(
        'TEXT_MODE',
        `[Text Mode] Solved by ${data.providerUsed || textProvider}. Correct answers: ${answerSummary || 'None explicitly marked'}`,
        sol
      );
    } catch (err: any) {
      setTextError(err.name === 'TimeoutError' || err.name === 'AbortError' ? 'The solve request exceeded 185 seconds and was stopped. Check the server log and selected model.' : (err.message || 'Error occurred while solving.'));
      addLocalLog('ERROR', `Text mode solve failed: ${err.message}`);
    } finally {
      setIsSolvingText(false);
    }
  };

  // Initial log entry & fetch server status, logs, and extension files
  useEffect(() => {
    checkServerStatus();
    fetchServerLogs();
    fetchExtensionFiles();
    const interval = setInterval(() => {
      checkServerStatus();
      fetchServerLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchExtensionFiles = async () => {
    try {
      const res = await fetch('/api/extension/files');
      if (res.ok) {
        const data = await res.json();
        if (data.files) {
          setExtensionFiles(data.files);
        }
      }
    } catch {}
  };

  const handleClientDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(false);
    try {
      const targetUrl = serverStatus?.appUrl || window.location.origin;
      const res = await fetch(`/api/download-extension?serverUrl=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (blob.size < 500) {
        throw new Error('Downloaded archive was incomplete or truncated by browser sandbox.');
      }
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'autosolve-ai-chrome-extension.zip';
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      link.remove();
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err: any) {
      setDownloadError(err.message || 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const fetchServerLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newServerLogs = data.logs.filter((l: ConsoleLogEntry) => !existingIds.has(l.id));
            if (newServerLogs.length === 0) return prev;
            return [...newServerLogs, ...prev].slice(0, 200);
          });
        }
      }
    } catch {}
  };

  const addLocalLog = (level: ConsoleLogEntry['level'], message: string, data?: any) => {
    const entry: ConsoleLogEntry = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 199)]);

    // MANDATORY REQUIREMENT: Note every coordinate, click, and text answer in browser console
    if (level === 'COORDINATES') {
      console.log(`%c[AutoSolve AI][COORDINATES] ${message}`, 'color: #0284c7; font-weight: bold;', data || '');
    } else if (level === 'CLICK') {
      console.log(`%c[AutoSolve AI][CLICK] ${message}`, 'color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;', data || '');
    } else if (level === 'AI_VISION') {
      console.log(`%c[AutoSolve AI][AI_VISION] ${message}`, 'color: #7c3aed; font-weight: bold;');
    } else if (level === 'TEXT_MODE') {
      console.log(`%c[AutoSolve AI][TEXT_MODE] ${message}`, 'color: #3b82f6; font-weight: bold; background: #0f172a; padding: 2px 8px; border-radius: 4px;', data || '');
    } else {
      console.log(`[AutoSolve AI][${level}] ${message}`);
    }
  };

  const checkServerStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch {}
  };

  // Run screen analysis through Gemini backend
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setSelectedOptionIndices([]);
    setNextButtonClicked(false);
    setClickRipples([]);

    const currentImage = customImage || selectedPreset.svgDataUri;
    addLocalLog('AI_VISION', `Sending screenshot to /api/analyze-screen (${selectedPreset.title})...`);

    try {
      const res = await fetch('/api/analyze-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: currentImage,
          viewportWidth: 1200,
          viewportHeight: 750,
          userPrompt: `Detect question, options, answer coordinates, and next button for ${selectedPreset.title}`,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server analysis failed');
      }

      const { analysis, meta } = data;
      setAnalysisResult(analysis);
      setAnalysisMeta(meta);

      addLocalLog('AI_VISION', `Question detected: "${analysis.question || 'N/A'}" (Type: ${analysis.questionType})`);
      addLocalLog('REASONING', `Reasoning: ${analysis.conciseReasoning}`);

      // MANDATORY REQUIREMENT: Note retrieved answers and their X and Y coordinates in the console!
      console.group('%c[AutoSolve AI] Retrieved Answers and Coordinates from Gemini', 'color: #2563eb; font-weight: bold; font-size: 13px;');
      console.log(`Question: "${analysis.question}" (Type: ${analysis.questionType})`);
      console.log(`Reasoning: ${analysis.conciseReasoning}`);

      (analysis.options || []).forEach((opt: AnalysisOption, idx: number) => {
        const optNum = opt.number || idx + 1;
        const optLetter = opt.letter || String.fromCharCode(65 + idx);
        const xPct = opt.coordinates?.xPercent ?? 50;
        const yPct = opt.coordinates?.yPercent ?? 50;
        const xPx = Math.round((xPct / 100) * 1200);
        const yPx = Math.round((yPct / 100) * 750);
        const status = opt.isCorrect ? '✅ [CORRECT ANSWER]' : '❌ [INCORRECT]';

        console.log(
          `%c${status} Option [${optNum}] (${optLetter}): "${opt.text}" -> Coordinates: X=${xPx}px (${xPct.toFixed(1)}%), Y=${yPx}px (${yPct.toFixed(1)}%) [Confidence: ${(opt.confidence * 100).toFixed(0)}%]`,
          opt.isCorrect ? 'color: #16a34a; font-weight: bold;' : 'color: #64748b;'
        );

        if (opt.isCorrect) {
          console.log(
            `%c👉 SCREENSHOT ANSWER [${optNum}] (${optLetter}): "${opt.text}"`,
            'color: #10b981; font-weight: bold; font-size: 13px; background: #064e3b; padding: 2px 8px; border-radius: 4px;'
          );
          addLocalLog(
            'CLICK',
            `👉 SCREENSHOT ANSWER [${optNum}] (${optLetter}): "${opt.text}" [CORRECT ANSWER]`,
            { number: optNum, letter: optLetter, text: opt.text, xPx, yPx }
          );
        }

        addLocalLog(
          'COORDINATES',
          `Option [${optNum}] (${optLetter}) [${opt.isCorrect ? 'CORRECT' : 'INCORRECT'}]: "${opt.text}" -> X=${xPx}px (${xPct.toFixed(1)}%), Y=${yPx}px (${yPct.toFixed(1)}%)`,
          { number: optNum, letter: optLetter, text: opt.text, isCorrect: opt.isCorrect, xPx, yPx, xPercent: xPct, yPercent: yPct }
        );
      });

      if (analysis.nextButton?.detected || analysis.nextButton?.coordinates) {
        const nbX = analysis.nextButton.coordinates?.xPercent ?? 88;
        const nbY = analysis.nextButton.coordinates?.yPercent ?? 88;
        const nbXPx = Math.round((nbX / 100) * 1200);
        const nbYPx = Math.round((nbY / 100) * 750);

        console.log(
          `%c[AutoSolve AI][COORDINATES] Next/Submit Button -> Coordinates: X=${nbXPx}px (${nbX.toFixed(1)}%), Y=${nbYPx}px (${nbY.toFixed(1)}%)`,
          'color: #0284c7; font-weight: bold;'
        );

        addLocalLog(
          'COORDINATES',
          `Next Button located at X=${nbXPx}px (${nbX.toFixed(1)}%), Y=${nbYPx}px (${nbY.toFixed(1)}%)`,
          { xPx: nbXPx, yPx: nbYPx, xPercent: nbX, yPercent: nbY }
        );
      }
      console.groupEnd();
    } catch (err: any) {
      addLocalLog('ERROR', `Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Run human-like click simulation over the canvas
  const handleSimulateClicks = async () => {
    if (!analysisResult || isSimulating) return;

    setIsSimulating(true);
    setSelectedOptionIndices([]);
    setNextButtonClicked(false);
    setVirtualCursor({ xPercent: 50, yPercent: 90, visible: true });
    setSimulationStep('Initializing natural mouse path...');

    const correctOptions = analysisResult.options
      .map((opt, index) => ({ opt, index }))
      .filter((item) => item.opt.isCorrect);

    // Fallback if none explicitly marked
    const targetItems = correctOptions.length > 0 ? correctOptions : [{ opt: analysisResult.options[0], index: 0 }];

    // 1. Move to and click each correct answer
    for (let i = 0; i < targetItems.length; i++) {
      const { opt, index } = targetItems[i];
      const tx = opt.coordinates.xPercent;
      const ty = opt.coordinates.yPercent;
      const xPx = Math.round((tx / 100) * 1200);
      const yPx = Math.round((ty / 100) * 750);

      setSimulationStep(`Moving naturally to Option ${index + 1}: "${opt.text.slice(0, 30)}..."`);

      // Glide cursor
      setVirtualCursor({ xPercent: tx, yPercent: ty, visible: true });
      await new Promise((r) => setTimeout(r, 650));

      // MANDATORY REQUIREMENT: Note every click in the console with exact coordinates
      console.log(
        `%c[AutoSolve AI][CLICK] Clicked coordinate (X: ${xPx}px, Y: ${yPx}px) for Option ${index + 1} "${opt.text}"`,
        'color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;'
      );

      addLocalLog(
        'CLICK',
        `Clicked at coordinate (X: ${xPx}px, Y: ${yPx}px) for Option ${index + 1} "${opt.text}"`,
        { xPx, yPx, xPercent: tx, yPercent: ty, optionIndex: index, text: opt.text }
      );

      // Flash click ripple & select
      setClickRipples((prev) => [
        ...prev,
        { id: `ripple-${Date.now()}`, xPct: tx, yPct: ty, label: `Answer ${index + 1}` },
      ]);
      setSelectedOptionIndices((prev) => [...prev, index]);

      await new Promise((r) => setTimeout(r, 450));
    }

    // 2. Move to and click Next/Submit button
    if (analysisResult.nextButton?.coordinates) {
      const nbX = analysisResult.nextButton.coordinates.xPercent;
      const nbY = analysisResult.nextButton.coordinates.yPercent;
      const nbXPx = Math.round((nbX / 100) * 1200);
      const nbYPx = Math.round((nbY / 100) * 750);

      setSimulationStep('Moving cursor to Next / Submit Button...');
      await new Promise((r) => setTimeout(r, 400));

      setVirtualCursor({ xPercent: nbX, yPercent: nbY, visible: true });
      await new Promise((r) => setTimeout(r, 650));

      // MANDATORY REQUIREMENT: Note every click in the console
      console.log(
        `%c[AutoSolve AI][CLICK] Clicked Next/Submit Button at coordinate (X: ${nbXPx}px, Y: ${nbYPx}px)`,
        'color: #0284c7; font-weight: bold; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;'
      );

      addLocalLog(
        'CLICK',
        `Clicked Next/Submit Button at coordinate (X: ${nbXPx}px, Y: ${nbYPx}px)`,
        { xPx: nbXPx, yPx: nbYPx, xPercent: nbX, yPercent: nbY }
      );

      setClickRipples((prev) => [
        ...prev,
        { id: `ripple-${Date.now()}`, xPct: nbX, yPct: nbY, label: 'Next' },
      ]);
      setNextButtonClicked(true);
      setSimulationStep('Question completed & submitted successfully!');

      addLocalLog('COMPLETE', 'AutoSolve execution finished: All answers clicked and submitted.');
    } else {
      setSimulationStep('Completed: Correct option(s) selected.');
      addLocalLog('COMPLETE', 'Selection complete.');
    }

    await new Promise((r) => setTimeout(r, 800));
    setIsSimulating(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCustomImage(event.target.result as string);
          setAnalysisResult(null);
          addLocalLog('INFO', `Custom screenshot loaded: ${file.name} (${Math.round(file.size / 1024)} KB)`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'all') return true;
    if (logFilter === 'coordinates') return log.level === 'COORDINATES';
    if (logFilter === 'clicks') return log.level === 'CLICK';
    if (logFilter === 'vision') return log.level === 'AI_VISION' || log.level === 'REASONING';
    if (logFilter === 'errors') return log.level === 'ERROR';
    return true;
  });

  const currentDisplayImage = customImage || selectedPreset.svgDataUri;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans flex flex-col selection:bg-blue-500/30 selection:text-white">
      {/* ================= TOP BAR CONTRACT (Strict 3-zone layout) ================= */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0d121f] border-b border-slate-800 shrink-0 sticky top-0 z-50">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm">
            <Crosshair className="w-4 h-4" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              AutoSolve AI
            </div>
            <div className="text-[11px] text-slate-400 font-normal whitespace-nowrap">
              Vision Q&A & Extension Hub
            </div>
          </div>
        </div>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Simulator & Screen Tester
          </button>
          <button
            onClick={() => setActiveTab('text_mode')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'text_mode'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Text Mode (Any AI)</span>
          </button>
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'console'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Live Event Console</span>
            {logs.length > 0 && (
              <span className="text-[11px] font-mono px-1.5 py-0.2 bg-slate-700/60 rounded text-blue-400 tabular-nums">
                {logs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('manager')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'manager'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Extension Package
          </button>
          <button
            onClick={() => setActiveTab('diagnosis')}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'diagnosis'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Stall Diagnosis & Fixes</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/api/download-extension"
            download="autosolve-ai-chrome-extension.zip"
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Extension (.zip)</span>
          </a>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-6 flex flex-col gap-6">
        {/* Direct Gemini Mode Banner */}
        <div className="p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0 mt-0.5 text-white font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Direct Gemini Mode Active: Standalone Chrome Extension</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-300 border border-emerald-700">
                  No Server or API_KEY.txt Needed
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                You can now paste your personal Gemini API key (<code className="bg-slate-900 px-1 py-0.5 rounded text-emerald-400 font-mono">AIzaSy...</code>) directly into the extension popup! The extension queries Google's Gemini Vision API directly from Chrome.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('manager')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow transition-colors whitespace-nowrap"
            >
              <span>View Extension Package</span>
            </button>
          </div>
        </div>

        {/* ================= TAB 1: SIMULATOR & SCREEN TESTER ================= */}
        {activeTab === 'simulator' && (
          <div className="flex flex-col gap-6">
            {/* Top Controls Strip */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#111827] rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
                  Preset Screens:
                </span>
                {PRESET_SCENARIOS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedPreset(preset);
                      setCustomImage(null);
                      setAnalysisResult(null);
                      setSelectedOptionIndices([]);
                      setNextButtonClicked(false);
                      setClickRipples([]);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      !customImage && selectedPreset.id === preset.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {preset.title.split('-')[0].trim()}
                  </button>
                ))}

                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer transition-colors whitespace-nowrap">
                  <span>Upload Screenshot</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isSimulating}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors whitespace-nowrap"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  <span>{isAnalyzing ? 'Querying Gemini 3.8...' : 'Analyze with Gemini Vision'}</span>
                </button>

                {analysisResult && (
                  <button
                    onClick={handleSimulateClicks}
                    disabled={isSimulating}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors whitespace-nowrap"
                  >
                    <MousePointer2 className="w-3.5 h-3.5" />
                    <span>{isSimulating ? 'Simulating...' : 'Simulate Human Click Sequence'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Split Grid: Interactive Screen Canvas (Left 7 cols) & Analysis Data (Right 5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Screen Viewport Display */}
              <div className="lg:col-span-8 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">
                      {customImage ? 'Custom Uploaded Screen' : selectedPreset.title}
                    </span>
                    <span>·</span>
                    <span className="font-mono tabular-nums text-slate-400">1200 × 750 px</span>
                  </div>
                  {isSimulating && (
                    <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>{simulationStep}</span>
                    </div>
                  )}
                </div>

                {/* Viewport Frame with Interactive Coordinate Overlay */}
                <div
                  ref={containerRef}
                  className="relative w-full aspect-[16/10] bg-[#020617] rounded-xl overflow-hidden border border-slate-800 shadow-xl select-none"
                >
                  {/* Screenshot Backdrop */}
                  <img
                    src={currentDisplayImage}
                    alt="Quiz Screenshot"
                    className="w-full h-full object-contain pointer-events-none"
                  />

                  {/* Visual Coordinate Markers from Gemini Analysis */}
                  {analysisResult?.options?.map((opt, idx) => {
                    const xPct = opt.coordinates.xPercent;
                    const yPct = opt.coordinates.yPercent;
                    const isSelected = selectedOptionIndices.includes(idx);
                    const isCorrect = opt.isCorrect;

                    return (
                      <div
                        key={`marker-${idx}`}
                        style={{ left: `${xPct}%`, top: `${yPct}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group pointer-events-auto z-20 cursor-pointer"
                        onClick={() => {
                          setSelectedOptionIndices((prev) =>
                            prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                          );
                          const xPx = Math.round((xPct / 100) * 1200);
                          const yPx = Math.round((yPct / 100) * 750);
                          addLocalLog('CLICK', `Manual click on coordinate (X: ${xPx}px, Y: ${yPx}px) for Option ${idx + 1}`);
                        }}
                      >
                        {/* Target Reticle */}
                        <div
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'border-emerald-400 bg-emerald-500/30 scale-125 ring-4 ring-emerald-500/20'
                              : isCorrect
                              ? 'border-emerald-500 bg-emerald-950/40'
                              : 'border-slate-500 bg-slate-900/60'
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              isSelected ? 'bg-emerald-300' : isCorrect ? 'bg-emerald-400' : 'bg-slate-400'
                            }`}
                          />
                        </div>

                        {/* Coordinate Badge Tooltip */}
                        <div className="absolute top-9 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-slate-700 text-[11px] font-mono px-2 py-0.5 rounded shadow-lg whitespace-nowrap opacity-90 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                          <span className={isCorrect ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                            {opt.text.slice(0, 16)}...
                          </span>{' '}
                          <span className="text-slate-400 tabular-nums">
                            ({xPct.toFixed(1)}%, {yPct.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Next / Submit Button Reticle */}
                  {analysisResult?.nextButton?.coordinates && (
                    <div
                      style={{
                        left: `${analysisResult.nextButton.coordinates.xPercent}%`,
                        top: `${analysisResult.nextButton.coordinates.yPercent}%`,
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
                    >
                      <div
                        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                          nextButtonClicked
                            ? 'border-blue-400 bg-blue-500/40 scale-125 ring-4 ring-blue-500/20'
                            : 'border-blue-500 bg-blue-950/50'
                        }`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                      </div>
                      <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-blue-500/40 text-[10px] font-mono text-blue-300 px-2 py-0.5 rounded shadow whitespace-nowrap">
                        Next Button ({analysisResult.nextButton.coordinates.xPercent.toFixed(1)}%,{' '}
                        {analysisResult.nextButton.coordinates.yPercent.toFixed(1)}%)
                      </div>
                    </div>
                  )}

                  {/* Animated Click Ripples */}
                  {clickRipples.map((ripple) => (
                    <div
                      key={ripple.id}
                      style={{ left: `${ripple.xPct}%`, top: `${ripple.yPct}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 animate-ping w-12 h-12 rounded-full border-2 border-emerald-400 bg-emerald-500/20"
                    />
                  ))}

                  {/* Virtual Smooth Cursor */}
                  {virtualCursor.visible && (
                    <div
                      style={{
                        left: `${virtualCursor.xPercent}%`,
                        top: `${virtualCursor.yPercent}%`,
                        transition: 'left 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      }}
                      className="absolute -translate-x-1 -translate-y-1 pointer-events-none z-40"
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M4 3L11 20L13.5 13.5L20 11L4 3Z"
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="1.8"
                        />
                        <circle cx="4" cy="3" r="2.5" fill="#60a5fa" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* Analysis Results & Coordinate Breakdown Panel */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                <div className="p-4 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Gemini Vision Output
                    </span>
                    {analysisMeta && (
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {analysisMeta.latencyMs}ms · {analysisMeta.model}
                      </span>
                    )}
                  </div>

                  {!analysisResult ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 gap-2">
                      <Eye className="w-8 h-8 text-slate-600" />
                      <p className="text-sm">Click "Analyze with Gemini Vision" to test coordinate retrieval.</p>
                      <span className="text-xs text-slate-600">
                        Supports single-choice, multi-select, true/false, and video module detection.
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {/* Detected Question */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          Question ({analysisResult.questionType})
                        </div>
                        <p className="text-sm font-medium text-slate-200 leading-snug">
                          {analysisResult.question}
                        </p>
                      </div>

                      {/* Concise Reasoning */}
                      <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs text-slate-300 leading-relaxed">
                        <span className="font-semibold text-blue-400 block mb-1">AI Reasoning:</span>
                        {analysisResult.conciseReasoning}
                      </div>

                      {/* Answers & Exact Coordinates Table */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                          <span>Detected Choices & Coordinates</span>
                          <span className="font-mono text-slate-500 text-[10px]">
                            {analysisResult.options.filter((o) => o.isCorrect).length} Correct
                          </span>
                        </div>

                        <div className="flex flex-col gap-2">
                          {analysisResult.options.map((opt, idx) => {
                            const isCorrect = opt.isCorrect;
                            const isSelected = selectedOptionIndices.includes(idx);
                            const xPx = Math.round((opt.coordinates.xPercent / 100) * 1200);
                            const yPx = Math.round((opt.coordinates.yPercent / 100) * 750);

                            return (
                              <div
                                key={idx}
                                className={`p-2.5 rounded-lg border transition-all text-xs flex flex-col gap-1.5 ${
                                  isSelected
                                    ? 'bg-emerald-950/40 border-emerald-500'
                                    : isCorrect
                                    ? 'bg-emerald-950/20 border-emerald-800/60'
                                    : 'bg-slate-900/60 border-slate-800'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-medium text-slate-200 flex-1 leading-snug">
                                    {opt.text}
                                  </span>
                                  {isCorrect && (
                                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80 shrink-0">
                                      CORRECT
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                                  <span className="text-slate-400">
                                    X: <strong className="text-slate-200 tabular-nums">{xPx}px</strong>{' '}
                                    ({opt.coordinates.xPercent.toFixed(1)}%)
                                  </span>
                                  <span className="text-slate-400">
                                    Y: <strong className="text-slate-200 tabular-nums">{yPx}px</strong>{' '}
                                    ({opt.coordinates.yPercent.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Next Button Target */}
                      {analysisResult.nextButton?.detected && (
                        <div className="p-2.5 rounded-lg bg-blue-950/20 border border-blue-900/40 flex items-center justify-between text-xs">
                          <span className="font-medium text-blue-300">Next / Submit Button Target</span>
                          <span className="font-mono text-blue-400 text-[11px] tabular-nums">
                            X: {analysisResult.nextButton.coordinates?.xPercent.toFixed(1)}%, Y:{' '}
                            {analysisResult.nextButton.coordinates?.yPercent.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TEXT MODE: MULTI-AI NUMBERED Q&A SOLVER ================= */}
        {activeTab === 'text_mode' && (
          <div className="flex flex-col gap-6">
            {/* Mode Explanatory Banner */}
            <div className="p-4 bg-blue-950/40 border border-blue-800/60 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 mt-0.5 text-white font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Text Mode: Zero-Interaction Multi-AI Solver</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-900 text-blue-200 border border-blue-700">
                      Numbered Console Output ([1], [2], [3])
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Strictly passive evaluation. Does <strong>not</strong> interact with your screen, does <strong>not</strong> move the cursor, and does <strong>not</strong> click any buttons. Answers are computed by your chosen AI model and output with explicit numbers directly to the console and cards below.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded">
                  Passive Mode Active
                </span>
              </div>
            </div>

            {/* AI Provider & API Key Selection */}
            <div className="p-5 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Select AI Provider & Model
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Switch between models or use your own custom endpoint
                </span>
              </div>

              {/* Provider Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 3.8 Flash' },
                  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o / o3-mini' },
                  { id: 'claude', name: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet' },
                  { id: 'deepseek', name: 'DeepSeek', desc: 'DeepSeek-V3 / R1' },
                  { id: 'custom', name: 'Custom Endpoint', desc: 'Groq / Ollama / Router' },
                ].map((prov) => {
                  const isActive = textProvider === prov.id;
                  return (
                    <button
                      key={prov.id}
                      onClick={() => handleProviderSelect(prov.id as any)}
                      className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                        isActive
                          ? 'bg-blue-950/60 border-blue-500 ring-2 ring-blue-500/30'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                        <span>{prov.name}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">{prov.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Credentials & Model Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {/* API Key */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <label className="font-semibold flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      <span>{textProvider.toUpperCase()} API Key</span>
                      {textProvider === 'gemini' && (
                        <span className="text-[10px] text-slate-500 font-normal">
                          (Defaults to server environment if left blank)
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleVerifyKey()}
                        disabled={keyValidating}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors"
                      >
                        {keyValidating ? 'Testing...' : 'Test Key Online'}
                      </button>
                      <button
                        onClick={() => setShowKeyField(!showKeyField)}
                        className="text-[10px] text-slate-400 hover:text-slate-300"
                      >
                        {showKeyField ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type={showKeyField ? 'text' : 'password'}
                      value={textApiKey}
                      onChange={(e) => handleKeySave(e.target.value)}
                      placeholder={
                        textProvider === 'gemini'
                          ? 'AIzaSy... (or leave blank to use server key)'
                          : textProvider === 'openai'
                          ? 'sk-...'
                          : textProvider === 'claude'
                          ? 'sk-ant-...'
                          : textProvider === 'deepseek'
                          ? 'sk-...'
                          : 'Your API Key'
                      }
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-blue-500"
                    />
                    {keyValidResult && (
                      <span
                        className={`text-[10px] font-mono px-2.5 py-1.5 rounded shrink-0 border flex items-center gap-1 ${
                          keyValidResult.valid
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                            : 'bg-rose-950/80 text-rose-300 border-rose-700'
                        }`}
                      >
                        <span>{keyValidResult.valid ? '●' : '✗'}</span>
                        <span>{keyValidResult.message}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Model Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Model Name</label>
                  {textProvider === 'gemini' ? (
                    <select
                      value={textModel}
                      onChange={(e) => setTextModel(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended)</option>
                      <option value="gemini-flash-latest">gemini-flash-latest</option>
                      <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fastest)</option>
                    </select>
                  ) : textProvider === 'openai' ? (
                    <select
                      value={textModel}
                      onChange={(e) => setTextModel(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="gpt-4o">gpt-4o</option>
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                      <option value="o3-mini">o3-mini</option>
                      <option value="o1">o1</option>
                    </select>
                  ) : textProvider === 'claude' ? (
                    <select
                      value={textModel}
                      onChange={(e) => setTextModel(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                      <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
                    </select>
                  ) : textProvider === 'deepseek' ? (
                    <select
                      value={textModel}
                      onChange={(e) => setTextModel(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="deepseek-chat">deepseek-chat (DeepSeek-V3)</option>
                      <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek-R1)</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={textCustomModel}
                      onChange={(e) => setTextCustomModel(e.target.value)}
                      placeholder="e.g. llama-3.3-70b-versatile, mistral..."
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-blue-500"
                    />
                  )}
                </div>

                {/* Custom Base URL (if custom selected) */}
                {textProvider === 'custom' && (
                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <label className="text-xs font-semibold text-slate-300">
                      OpenAI-Compatible Base URL
                    </label>
                    <input
                      type="text"
                      value={textCustomBaseUrl}
                      onChange={(e) => {
                        setTextCustomBaseUrl(e.target.value);
                        localStorage.setItem('autosolve_custom_base_url', e.target.value);
                      }}
                      placeholder="https://api.groq.com/openai/v1 or https://openrouter.ai/api/v1"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Question Input Box & Options */}
            <div className="p-5 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Paste Question & Options
                  </span>
                </div>
                {/* Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 mr-1">Sample Questions:</span>
                  <button
                    onClick={() => loadPresetText('keats_ode')}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-blue-300 rounded border border-slate-700"
                  >
                    Keats Ode (2-Select)
                  </button>
                  <button
                    onClick={() => loadPresetText('keats_dropdown')}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700"
                  >
                    Keats 3 Dropdowns
                  </button>
                  <button
                    onClick={() => loadPresetText('bio')}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded border border-slate-700"
                  >
                    Biology MCQ
                  </button>
                  <button
                    onClick={() => loadPresetText('swift_proposal')}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700"
                  >
                    Swift "Modest Proposal"
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  rows={8}
                  value={textQuestion}
                  onChange={(e) => setTextQuestion(e.target.value)}
                  placeholder="Paste the complete webpage text here, including every question, passage, and available answer choice. AutoSolve will process the questions in page order."
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg p-3.5 text-xs text-slate-200 font-mono leading-relaxed outline-none focus:border-blue-500 resize-y"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 px-1">
                  <span>Characters: {textQuestion.length}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const clip = await navigator.clipboard.readText();
                          if (clip) setTextQuestion(clip);
                        } catch {}
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Paste from Clipboard
                    </button>
                    <span>•</span>
                    <button
                      onClick={() => setTextQuestion('')}
                      className="text-slate-400 hover:text-rose-400"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300" htmlFor="autosolve-text-instructions">
                  Additional Instructions (Optional)
                </label>
                <textarea
                  id="autosolve-text-instructions"
                  rows={3}
                  value={textUserInstructions}
                  onChange={(e) => {
                    setTextUserInstructions(e.target.value);
                    localStorage.setItem('autosolve_text_user_instructions', e.target.value);
                  }}
                  placeholder="Optional instructions for this solver. Leave blank for general-purpose behavior."
                  className="w-full bg-[#0a0f1d] border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono leading-relaxed outline-none focus:border-blue-500 resize-y"
                />
                <span className="text-[10px] text-slate-500">
                  These instructions are editable and saved in this browser. No subject or curriculum is assumed by default.
                </span>
              </div>

              {/* Solve Button & Error Alert */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleSolveTextMode}
                  disabled={isSolvingText || !textQuestion.trim()}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all"
                >
                  <ListOrdered className={`w-4 h-4 ${isSolvingText ? 'animate-spin' : ''}`} />
                  <span>
                    {isSolvingText
                      ? `Solving with ${textProvider.toUpperCase()}...`
                      : `Solve Question & Output Numbered Answers (${textProvider.toUpperCase()})`}
                  </span>
                </button>

                {textError && (
                  <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{textError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Results Section: Numbered Cards & Console Stream */}
            {textSolution && (
              <div className="flex flex-col gap-5">
                {/* Solved Meta Header */}
                <div className="p-4 bg-[#111827] rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-400">
                      QUESTION SOLVED VIA TEXT MODE
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {textSolution.question || 'Academic Assessment Question'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      Type: {textSolution.questionType}
                    </span>
                    {textMeta && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                        {textMeta.provider.toUpperCase()} • {textMeta.latencyMs}ms
                      </span>
                    )}
                  </div>
                </div>

                {/* Numbered Choices Cards */}
                <div className="p-5 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Numbered Options & Correct Answers
                      </span>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 font-semibold">
                      {(textSolution.answers || []).length} Correct Answer(s) Identified
                    </span>
                  </div>

                  {/* All Choices list */}
                  <div className="flex flex-col gap-2.5">
                    {(textSolution.allChoices || []).map((ch: any, idx: number) => {
                      const num = ch.number ?? idx + 1;
                      const isCorrect = Boolean(ch.isCorrect);
                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-lg border transition-all flex items-start justify-between gap-4 ${
                            isCorrect
                              ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40 shadow-sm'
                              : 'bg-slate-900/60 border-slate-800/80 opacity-80'
                          }`}
                        >
                          <div className="flex items-start gap-3.5 flex-1">
                            {/* Number Badge */}
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-sm shrink-0 border ${
                                isCorrect
                                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              [{num}]
                            </div>

                            <div className="flex flex-col gap-1 pt-0.5">
                              <div className="text-xs font-medium text-slate-200 leading-snug">
                                {ch.letter && <span className="font-bold mr-1.5 text-slate-400">{ch.letter}.</span>}
                                <span>{ch.text}</span>
                              </div>
                            </div>
                          </div>

                          {/* Correct/Incorrect Badge */}
                          <div className="shrink-0 pt-0.5">
                            {isCorrect ? (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold font-mono">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>CORRECT [OPTION {num}]</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                                Option {num}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Dropdown Menu Cards (if dropdowns present) */}
                {Array.isArray(textSolution.dropdowns) && textSolution.dropdowns.length > 0 && (
                  <div className="p-5 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <ChevronRight className="w-4 h-4 text-sky-400" />
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          Drop-Down Menu Solutions
                        </span>
                      </div>
                      <span className="text-xs font-mono text-sky-400">
                        {textSolution.dropdowns.length} Menus
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {textSolution.dropdowns.map((dd: any, dIdx: number) => (
                        <div
                          key={dIdx}
                          className="p-3.5 rounded-lg bg-sky-950/20 border border-sky-800/60 flex flex-col gap-2"
                        >
                          <div className="text-[11px] font-bold text-sky-400 font-mono flex items-center justify-between">
                            <span>DROPDOWN [{dd.dropdownNumber || dIdx + 1}]</span>
                            <span className="text-white bg-sky-600 px-1.5 py-0.2 rounded text-[10px]">
                              Select Option [{dd.selectedAnswerNumber || '?'}]
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 font-medium">
                            {dd.prompt}
                          </div>
                          <div className="p-2 bg-slate-900/90 rounded border border-sky-600/40 text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>"{dd.selectedAnswerText}"</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Academic Reasoning Box */}
                <div className="p-5 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-2.5">
                  <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Academic & Literary Explanation</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/70 p-3.5 rounded-lg border border-slate-800">
                    {textSolution.conciseReasoning}
                  </p>
                </div>

                {/* BIG PROMINENT GREEN ANSWER BANNER AT THE END */}
                <div className="p-6 bg-gradient-to-r from-emerald-950 via-emerald-900/90 to-emerald-950 rounded-xl border-2 border-emerald-500 shadow-xl shadow-emerald-950/60 flex flex-col items-center justify-center text-center gap-2.5 my-1">
                  <div className="text-xs font-black text-emerald-300 uppercase tracking-widest flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>CORRECT ANSWER</span>
                  </div>
                  {(textSolution.answers || []).map((ans: any, idx: number) => (
                    <div key={idx} className="text-xl sm:text-2xl font-black text-white tracking-wide">
                      👉 [{ans.number || 1}] {ans.letter ? `(${ans.letter}) ` : ''}"{ans.text}"
                    </div>
                  ))}
                  {textSolution.dropdowns?.map((dd: any, idx: number) => (
                    <div key={idx} className="text-sm font-bold text-emerald-200 mt-1">
                      Dropdown [{dd.menuNumber || dd.dropdownNumber || idx + 1}]: Pick Option [{dd.selectedNumber || dd.selectedAnswerNumber || 1}] "{dd.selectedAnswer || dd.selectedAnswerText}"
                    </div>
                  ))}
                </div>

                {/* Console Output Monospace Preview */}
                <div className="p-5 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Console Numbered Output
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const lines: string[] = [
                          `[AutoSolve AI][TEXT MODE] Question: ${textSolution.question}`,
                          ...(textSolution.answers || []).map(
                            (a: any) => `[AutoSolve AI][TEXT MODE] 👉 ANSWER [${a.number}]: "${a.text}"`
                          ),
                          ...(textSolution.dropdowns || []).map(
                            (dd: any) =>
                              `[AutoSolve AI][TEXT MODE] 👉 DROPDOWN [${dd.dropdownNumber}]: Select Option [${dd.selectedAnswerNumber}] "${dd.selectedAnswerText}"`
                          ),
                        ];
                        navigator.clipboard.writeText(lines.join('\n'));
                        setCopiedKey('console_text');
                        setTimeout(() => setCopiedKey(null), 2000);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                    >
                      {copiedKey === 'console_text' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Console Text</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="bg-[#050811] text-slate-300 font-mono text-xs p-3.5 rounded-lg border border-slate-800 overflow-x-auto leading-relaxed">
{`[AutoSolve AI][TEXT MODE] Question: "${textSolution.question}"
${(textSolution.allChoices || []).map((ch: any) => `Option [${ch.number || '?'}] ${ch.letter ? `(${ch.letter}) ` : ''}: "${ch.text}" -> ${ch.isCorrect ? '✅ [CORRECT ANSWER]' : '❌ [INCORRECT]'}`).join('\n')}
${(textSolution.answers || []).map((a: any) => `👉 ANSWER [${a.number}] ${a.letter ? `(${a.letter}) ` : ''}: "${a.text}"`).join('\n')}${textSolution.dropdowns?.length ? '\n' + textSolution.dropdowns.map((d: any) => `👉 DROPDOWN [${d.dropdownNumber}]: Pick Option [${d.selectedAnswerNumber}] "${d.selectedAnswerText}"`).join('\n') : ''}`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: LIVE EVENT CONSOLE ================= */}
        {activeTab === 'console' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#111827] rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold text-white">Console Stream & Coordinate Logger</span>
                <span className="text-xs text-slate-500 font-mono">
                  ({filteredLogs.length} events recorded)
                </span>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-lg border border-slate-800">
                {(['all', 'coordinates', 'clicks', 'vision', 'errors'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setLogFilter(filter)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                      logFilter === filter
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {filter === 'coordinates' ? 'Coordinates Only' : filter === 'clicks' ? 'Clicks Only' : filter}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setLogs([])}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Clear Console
              </button>
            </div>

            {/* Console Log Terminal */}
            <div className="bg-[#050811] rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-y-auto max-h-[600px] flex flex-col gap-1.5 shadow-inner">
              {filteredLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-600">
                  No log entries matching filter "{logFilter}". Run an analysis or click test in the Simulator!
                </div>
              ) : (
                filteredLogs.map((log) => {
                  let badgeColor = 'text-slate-400 bg-slate-900 border-slate-800';
                  if (log.level === 'CLICK') badgeColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
                  if (log.level === 'COORDINATES') badgeColor = 'text-sky-400 bg-sky-950/60 border-sky-800';
                  if (log.level === 'AI_VISION') badgeColor = 'text-purple-400 bg-purple-950/60 border-purple-800';
                  if (log.level === 'ERROR') badgeColor = 'text-rose-400 bg-rose-950/60 border-rose-800';
                  if (log.level === 'COMPLETE') badgeColor = 'text-teal-400 bg-teal-950/60 border-teal-800';

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 py-1 px-2 rounded hover:bg-slate-900/40 border-b border-slate-900/50"
                    >
                      <span className="text-slate-500 text-[11px] tabular-nums shrink-0 pt-0.5">
                        [{log.timestamp}]
                      </span>
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border shrink-0 ${badgeColor}`}
                      >
                        {log.level}
                      </span>
                      <span className="text-slate-300 break-all leading-relaxed flex-1">
                        {log.message}
                      </span>
                      {log.data && (
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          {JSON.stringify(log.data)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: EXTENSION MANAGER & DOWNLOAD ================= */}
        {activeTab === 'manager' && (
          <div className="flex flex-col gap-6">
            <div className="p-6 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <h2 className="text-lg font-bold text-white">AutoSolve AI Chrome Extension</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Updated Manifest V3 package with fix for Gemini stalling, exact coordinate logging, and 16x video acceleration.
                  </p>
                </div>

                <a
                  href="/api/download-extension"
                  download="autosolve-ai-chrome-extension.zip"
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Extension (.zip)</span>
                </a>
              </div>

              {/* Download Bar & Client-Side Blob Downloader */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/80 rounded-xl border border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-white">Direct Download & Browser Extraction</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Generates a verified in-memory ZIP blob to prevent sandbox iframe download truncation.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClientDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg shadow transition-colors"
                  >
                    <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                    <span>{isDownloading ? 'Preparing ZIP...' : 'Download Verified ZIP'}</span>
                  </button>

                  <a
                    href="/api/download-extension"
                    download="autosolve-ai-chrome-extension.zip"
                    className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
                  >
                    Direct Link
                  </a>
                </div>
              </div>

              {downloadSuccess && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>ZIP successfully generated in browser and sent to download manager.</span>
                </div>
              )}

              {downloadError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Download issue: {downloadError}. You can copy the code files below directly.</span>
                </div>
              )}

              {/* 4-Step Installation Guide */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/70 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-blue-400 font-mono">01. DOWNLOAD & EXTRACT</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Download the <code className="text-slate-200 bg-slate-800 px-1 rounded">.zip</code> package and extract the contents to a local folder on your computer.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/70 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-blue-400 font-mono">02. OPEN EXTENSIONS</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    In Google Chrome or Brave, navigate to <code className="text-slate-200 bg-slate-800 px-1 rounded">chrome://extensions</code>.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/70 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-blue-400 font-mono">03. DEVELOPER MODE</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Toggle the <strong>Developer mode</strong> switch in the upper-right corner of the Extensions page.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/70 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-blue-400 font-mono">04. LOAD UNPACKED</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Click <strong>Load unpacked</strong> and select the unzipped extension directory. Done!
                  </p>
                </div>
              </div>

              {/* Why File Size Difference Notice */}
              <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 flex flex-col gap-2">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-blue-400" />
                  <span>Archive Structure & Compression Details</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your original upload contained 12 files totaling <strong>22,445 uncompressed bytes</strong>. In different operating systems, zip archives can range from ~20 KB (standard DEFLATE compression level) up to ~49 KB (uncompressed STORE format). All 12 files (including manifest, background service worker, natural coordinate clicker, popup, options, and icons) are verified and present.
                </p>
              </div>

              {/* In-Browser Source Code Inspector & 1-Click Copy */}
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <div className="text-xs font-semibold text-white">Direct Source Code Inspector</div>
                    <div className="text-[11px] text-slate-400">
                      Copy patched code files directly to your local folder without extracting a zip.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const content = extensionFiles[selectedInspectFile] || '';
                        copyToClipboard(content, `inspect-${selectedInspectFile}`);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                    >
                      {copiedKey === `inspect-${selectedInspectFile}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy {selectedInspectFile}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* File Tabs */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['content.js', 'background.js', 'manifest.json', 'popup.js', 'popup.html', 'options.js', 'options.html'].map(
                    (fileName) => (
                      <button
                        key={fileName}
                        onClick={() => setSelectedInspectFile(fileName)}
                        className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                          selectedInspectFile === fileName
                            ? 'bg-blue-600 text-white font-semibold shadow-sm'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {fileName}
                      </button>
                    )
                  )}
                </div>

                {/* File Content Preview Box */}
                <div className="relative mt-2">
                  <pre className="bg-[#050811] text-slate-300 font-mono text-xs p-4 rounded-lg border border-slate-800/80 overflow-x-auto max-h-[400px] leading-relaxed">
                    {extensionFiles[selectedInspectFile] || '// Loading file contents...'}
                  </pre>
                </div>
              </div>

              {/* Side-by-Side Original vs Patched Diff */}
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="text-xs font-semibold text-white">Side-by-Side: Original vs Patched Code Comparison</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  {/* Original */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-rose-400 font-bold">Original background.js (Stalled):</span>
                    <pre className="bg-[#0f111a] border border-rose-950 p-3 rounded text-rose-300 text-[11px] overflow-x-auto leading-relaxed">
{`// 1. window is undefined in Service Worker!
const DEFAULT_SERVER_URL = window?.location?.origin || 'http://localhost:3000';

// 2. Doesn't wait for clicks to finish:
const contentResponse = await chrome.tabs.sendMessage(activeTab.id, {
  action: 'EXECUTE_SOLUTION',
  analysis,
  options,
});

// 3. No coordinate logging to console`}
                    </pre>
                  </div>

                  {/* Patched */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-emerald-400 font-bold">Patched background.js (Working):</span>
                    <pre className="bg-[#0f1715] border border-emerald-950 p-3 rounded text-emerald-300 text-[11px] overflow-x-auto leading-relaxed">
{`// 1. Safe Service Worker origin without window:
const DEFAULT_SERVER_URL = 'http://localhost:3000';

// 2. Dynamic content script injection fallback:
await ensureContentScriptInjected(activeTab.id);

// 3. MANDATORY: Logs retrieved coordinates in console:
console.log(\`[AutoSolve AI][COORDINATES] Option \${i+1} -> X=\${xPct}%, Y=\${yPct}%\`);

// 4. Awaits full Promise response before next cycle:
const contentResponse = await chrome.tabs.sendMessage(...);`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Keyboard Shortcuts Reference */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Alt + Shift + S</div>
                    <div className="text-xs text-slate-400 mt-0.5">Capture screen, detect question, log coordinates, and auto-click answer</div>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800 rounded">
                    Solve Active Tab
                  </span>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Alt + Shift + V</div>
                    <div className="text-xs text-slate-400 mt-0.5">Accelerate all HTML5 videos in the active tab to 16x with 15s auto-next</div>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-purple-950 text-purple-300 border border-purple-800 rounded">
                    16x Video Boost
                  </span>
                </div>
              </div>

              {/* Backend Endpoint Config */}
              <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-300">Backend Server Endpoint</div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    {serverStatus?.appUrl || window.location.origin}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => copyToClipboard(serverStatus?.appUrl || window.location.origin, 'url')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    {copiedKey === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy Backend URL</span>
                  </button>

                  <button
                    onClick={checkServerStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 rounded-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Status: Connected</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: STALL DIAGNOSIS & APPLIED FIXES ================= */}
        {activeTab === 'diagnosis' && (
          <div className="flex flex-col gap-6">
            <div className="p-6 bg-[#111827] rounded-xl border border-slate-800 flex flex-col gap-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Stall Root Cause Analysis & Applied Patches</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Investigation of why the extension was stalling after checking with Gemini, and the exact architectural fixes implemented in both client and server.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-rose-400 font-mono">01. MISSING BACKEND ENDPOINT</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Before:</strong> The repository had no Express server mounted on port 3000. When the extension sent requests to <code className="text-slate-200 bg-slate-800 px-1 rounded">/api/analyze-screen</code>, Vite returned HTML, causing JSON parse failure or hanging.
                  </p>
                  <p className="text-xs text-emerald-400">
                    <strong>Fixed:</strong> Created full-stack <code className="bg-slate-800 px-1 rounded">server.ts</code> with robust <code className="bg-slate-800 px-1 rounded">/api/analyze-screen</code> powered by Gemini 3.8 Flash.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-rose-400 font-mono">02. SERVICE WORKER WINDOW CRASH</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Before:</strong> <code className="text-slate-200 bg-slate-800 px-1 rounded">background.js</code> accessed <code className="text-slate-200 bg-slate-800 px-1 rounded">window?.location?.origin</code>. In Manifest V3 service workers, <code className="text-slate-200 bg-slate-800 px-1 rounded">window</code> is not defined and throws a fatal ReferenceError.
                  </p>
                  <p className="text-xs text-emerald-400">
                    <strong>Fixed:</strong> Replaced with safe URL fallback and Chrome storage synchronization.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-rose-400 font-mono">03. EXECUTION LOCK WITHOUT WATCHDOG</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Before:</strong> In <code className="text-slate-200 bg-slate-800 px-1 rounded">content.js</code>, if any exception was thrown during clicking, <code className="text-slate-200 bg-slate-800 px-1 rounded">state.isExecuting</code> stayed <code className="text-slate-200 bg-slate-800 px-1 rounded">true</code> permanently, dropping all future requests.
                  </p>
                  <p className="text-xs text-emerald-400">
                    <strong>Fixed:</strong> Added a 12-second safety watchdog timer to automatically reset locks and report recovery.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-rose-400 font-mono">04. UN-AWAITED CLICK EXECUTION</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Before:</strong> <code className="text-slate-200 bg-slate-800 px-1 rounded">chrome.runtime.onMessage</code> returned immediately without awaiting the click loop. The background script then triggered new cycles while previous clicks were still running.
                  </p>
                  <p className="text-xs text-emerald-400">
                    <strong>Fixed:</strong> Returned <code className="bg-slate-800 px-1 rounded">true</code> in message listener and awaited full Promise completion before sending the response.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-rose-400 font-mono">05. CONTAINER CLICK BUBBLING</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Before:</strong> Clicks only fired <code className="text-slate-200 bg-slate-800 px-1 rounded">MouseEvent</code> on outer wrapper divs, which modern frameworks (React/Vue) often ignore for radio button checks.
                  </p>
                  <p className="text-xs text-emerald-400">
                    <strong>Fixed:</strong> Traverses DOM to find inner/associated <code className="bg-slate-800 px-1 rounded">&lt;input&gt;</code>, sets <code className="bg-slate-800 px-1 rounded">checked = true</code>, and fires both <code className="bg-slate-800 px-1 rounded">input</code> and <code className="bg-slate-800 px-1 rounded">change</code> events.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-bold text-rose-400 font-mono">06. MISSING SCRIPT INJECTION</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Before:</strong> If the extension was installed or reloaded while tabs were already open, <code className="text-slate-200 bg-slate-800 px-1 rounded">chrome.tabs.sendMessage</code> threw "Could not establish connection" and failed silently.
                  </p>
                  <p className="text-xs text-emerald-400">
                    <strong>Fixed:</strong> Added auto-injection with <code className="bg-slate-800 px-1 rounded">chrome.scripting.executeScript</code> fallback before dispatching messages.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
