// AutoSolve AI Content Script
// High-Precision Coordinate Clicker & Deep Multi-Frame DOM Solver
// Virtual Cursor & Click Pulse Rings restored with strict non-blocking pointer events
// All logs, coordinates, and receipts remain strictly in console and extension popup.

(function () {
  // 1. Aggressive sweep: Remove ANY existing or legacy text HUD cards/badges
  function removeAllHudElements() {
    try {
      const selectors = [
        '#autosolve-ai-hud',
        '.autosolve-hud',
        '#latest-action-bar',
        '.autosolve-card',
        '.autosolve-receipt',
        '[id*="autosolve-hud"]',
        '[class*="autosolve-hud"]',
        'div[style*="2147483647"]',
      ];
      const docs = getAllDocuments();
      for (const d of docs) {
        try {
          d.querySelectorAll(selectors.join(',')).forEach((el) => {
            try {
              el.remove();
            } catch {}
          });
        } catch {}
      }
    } catch {}
  }

  // Purge text HUDs immediately on script load
  removeAllHudElements();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeAllHudElements);
  }

  // Internal execution state
  const state = {
    currentCursorPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    isExecuting: false,
    logs: [],
    watchdogTimer: null,
  };

  function addLog(level, message, detail = null) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, level, message, detail };
    state.logs.push(entry);
    if (state.logs.length > 150) state.logs.shift();

    // Broadcast strictly to background and extension popup console
    chrome.runtime.sendMessage({
      action: 'NEW_LOG',
      log: entry,
    }).catch(() => {});
  }

  // Get active document for rendering visuals (prefers top window to avoid duplicate subframe elements)
  function getDisplayDocument() {
    try {
      if (window.top && window.top.document && window.top.document.body) {
        return window.top.document;
      }
    } catch {}
    return document;
  }

  // Get absolute top-window coordinates for any element (even inside nested iframes)
  function getTopCoordinates(el, localX, localY) {
    try {
      const rect = el.getBoundingClientRect();
      let x = typeof localX === 'number' ? localX : (rect.left + rect.width / 2);
      let y = typeof localY === 'number' ? localY : (rect.top + rect.height / 2);

      let curWin = el.ownerDocument?.defaultView || window;
      while (curWin && curWin !== window.top && curWin.parent && curWin.parent !== curWin) {
        if (curWin.frameElement) {
          const fRect = curWin.frameElement.getBoundingClientRect();
          x += fRect.left;
          y += fRect.top;
        }
        curWin = curWin.parent;
      }
      return { x, y };
    } catch {
      const rect = el.getBoundingClientRect();
      return {
        x: typeof localX === 'number' ? localX : (rect.left + rect.width / 2),
        y: typeof localY === 'number' ? localY : (rect.top + rect.height / 2),
      };
    }
  }

  // Virtual Cursor - Clean SVG with strict non-blocking pointer events and auto-fadeout
  let cursorFadeTimer = null;
  function ensureVirtualCursor() {
    const doc = getDisplayDocument();
    if (!doc || !doc.body) return null;

    let cursor = doc.getElementById('autosolve-ai-cursor');
    if (cursor) return cursor;

    cursor = doc.createElement('div');
    cursor.id = 'autosolve-ai-cursor';
    cursor.style.cssText = [
      'position: fixed !important',
      'top: 0 !important',
      'left: 0 !important',
      'width: 28px !important',
      'height: 28px !important',
      'pointer-events: none !important',
      'user-select: none !important',
      '-webkit-user-select: none !important',
      'z-index: 2147483646 !important',
      'opacity: 0',
      `transform: translate3d(${state.currentCursorPos.x}px, ${state.currentCursorPos.y}px, 0)`,
      'transition: opacity 0.25s ease !important',
      'will-change: transform, opacity !important',
      'filter: drop-shadow(0 2px 5px rgba(0,0,0,0.45)) drop-shadow(0 0 8px rgba(6, 182, 212, 0.75)) !important',
    ].join('; ');

    cursor.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;pointer-events:none;">
        <path d="M4 2L12.5 22.5L16 14.5L24 12L4 2Z" fill="#06b6d4" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="5.5" cy="4.5" r="1.5" fill="#ffffff" />
      </svg>
    `;

    try {
      (doc.body || doc.documentElement).appendChild(cursor);
    } catch {}
    return cursor;
  }

  function touchCursorVisibility(cursor) {
    if (!cursor) return;
    cursor.style.opacity = '1';
    if (cursorFadeTimer) clearTimeout(cursorFadeTimer);
    // Auto-fadeout after 1200ms idle so it never blocks or sits permanently on screen
    cursorFadeTimer = setTimeout(() => {
      try {
        if (cursor) cursor.style.opacity = '0';
      } catch {}
    }, 1200);
  }

  // Click Ripple / Expanding Pulse Ring with glowing concentric ring & center flash
  function flashClickEffect(x, y) {
    if (isNaN(x) || isNaN(y)) return;
    try {
      const doc = getDisplayDocument();
      if (!doc || !doc.body) return;

      const wrap = doc.createElement('div');
      wrap.className = 'autosolve-pulse-ring';
      wrap.style.cssText = [
        'position: fixed !important',
        `left: ${Math.round(x)}px !important`,
        `top: ${Math.round(y)}px !important`,
        'width: 0px !important',
        'height: 0px !important',
        'pointer-events: none !important',
        'user-select: none !important',
        '-webkit-user-select: none !important',
        'z-index: 2147483646 !important',
      ].join('; ');

      // Outer expanding glowing cyan ring
      const ring = doc.createElement('div');
      ring.style.cssText = [
        'position: absolute !important',
        'left: -14px !important',
        'top: -14px !important',
        'width: 28px !important',
        'height: 28px !important',
        'border-radius: 50% !important',
        'border: 2.5px solid #06b6d4 !important',
        'box-shadow: 0 0 14px #06b6d4, inset 0 0 10px rgba(6, 182, 212, 0.6) !important',
        'pointer-events: none !important',
        'user-select: none !important',
        'transform: scale(0.3) !important',
        'opacity: 1 !important',
        'transition: transform 0.5s cubic-bezier(0.1, 0.8, 0.2, 1), opacity 0.5s ease-out !important',
      ].join('; ');

      // Inner white flash dot
      const dot = doc.createElement('div');
      dot.style.cssText = [
        'position: absolute !important',
        'left: -5px !important',
        'top: -5px !important',
        'width: 10px !important',
        'height: 10px !important',
        'border-radius: 50% !important',
        'background: #ffffff !important',
        'box-shadow: 0 0 8px #38bdf8 !important',
        'pointer-events: none !important',
        'user-select: none !important',
        'transform: scale(1) !important',
        'opacity: 1 !important',
        'transition: transform 0.35s ease-out, opacity 0.35s ease-out !important',
      ].join('; ');

      wrap.appendChild(ring);
      wrap.appendChild(dot);
      (doc.body || doc.documentElement).appendChild(wrap);

      requestAnimationFrame(() => {
        ring.style.transform = 'scale(3.6)';
        ring.style.opacity = '0';
        dot.style.transform = 'scale(0.2)';
        dot.style.opacity = '0';
      });

      // Self-destruct after animation completes
      setTimeout(() => {
        try { wrap.remove(); } catch {}
      }, 550);
    } catch (e) {
      console.warn('[AutoSolve AI] Could not render pulse ring:', e);
    }
  }

  // Smooth curved human cursor trajectory simulation
  async function moveCursorNaturally(targetX, targetY, durationMs = 350) {
    if (isNaN(targetX) || isNaN(targetY)) return;

    const cursor = ensureVirtualCursor();
    touchCursorVisibility(cursor);

    const startX = state.currentCursorPos.x;
    const startY = state.currentCursorPos.y;
    const steps = Math.max(12, Math.floor(durationMs / 20));
    const stepDuration = durationMs / steps;

    for (let i = 0; i <= steps; i++) {
      const rawT = i / steps;
      const t = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;
      let curX = startX + (targetX - startX) * t;
      let curY = startY + (targetY - startY) * t;

      if (i > 0 && i < steps) {
        curX += (Math.random() - 0.5) * 1.5;
        curY += (Math.random() - 0.5) * 1.5;
      }

      state.currentCursorPos = { x: curX, y: curY };
      if (cursor) {
        cursor.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
      }
      await new Promise((r) => setTimeout(r, stepDuration));
    }
    state.currentCursorPos = { x: targetX, y: targetY };
    if (cursor) {
      cursor.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    }
    touchCursorVisibility(cursor);
  }

  // Traverse all documents (top level window, Edgenuity #stageFrame, and nested activity iframes)
  function getAllDocuments() {
    const docs = [document];
    try {
      if (window.parent && window.parent.document && !docs.includes(window.parent.document)) {
        docs.push(window.parent.document);
      }
    } catch {}
    try {
      if (window.top && window.top.document && !docs.includes(window.top.document)) {
        docs.push(window.top.document);
      }
    } catch {}

    try {
      const frames = document.querySelectorAll('iframe, frame');
      for (const f of frames) {
        try {
          const d = f.contentDocument || f.contentWindow?.document;
          if (d && !docs.includes(d)) {
            docs.push(d);
            const subFrames = d.querySelectorAll('iframe, frame');
            for (const sf of subFrames) {
              try {
                const sd = sf.contentDocument || sf.contentWindow?.document;
                if (sd && !docs.includes(sd)) docs.push(sd);
              } catch {}
            }
          }
        } catch {}
      }
    } catch {}
    return docs;
  }

  // Find interactable element penetrating through iframes
  function resolveInteractiveElement(x, y) {
    let curDoc = document;
    let curX = x;
    let curY = y;
    let targetEl = null;

    for (let depth = 0; depth < 5; depth++) {
      const el = curDoc.elementFromPoint(curX, curY);
      if (!el) break;
      targetEl = el;

      if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
        try {
          const rect = el.getBoundingClientRect();
          const subDoc = el.contentDocument || el.contentWindow?.document;
          if (subDoc) {
            curDoc = subDoc;
            curX = curX - rect.left;
            curY = curY - rect.top;
            continue;
          }
        } catch (e) {
          break;
        }
      }
      break;
    }

    if (!targetEl) return null;

    const doc = targetEl.ownerDocument || document;

    // Check if directly clickable or input
    if (
      targetEl.tagName === 'INPUT' ||
      targetEl.tagName === 'BUTTON' ||
      targetEl.tagName === 'LABEL' ||
      targetEl.getAttribute('role') === 'radio' ||
      targetEl.getAttribute('role') === 'checkbox' ||
      targetEl.getAttribute('role') === 'button'
    ) {
      return { element: targetEl, clientX: curX, clientY: curY, doc };
    }

    // Look upwards in the DOM hierarchy (handles answer choices, nav buttons, li.choice, FrameRight)
    const ancestor = targetEl.closest(
      'button, label, input, [role="radio"], [role="checkbox"], [role="button"], a, li, .answer-choice, .answer-choice-button, .mc-choice, .FrameRight, .FrameLeft, .footernav, .btnCheck, .btnNext, .choice'
    );
    if (ancestor) return { element: ancestor, clientX: curX, clientY: curY, doc };

    // Search inside the target element for input, button, or label
    const child = targetEl.querySelector('input, button, [role="radio"], [role="checkbox"], a, .answer-choice, label');
    if (child) return { element: child, clientX: curX, clientY: curY, doc };

    return { element: targetEl, clientX: curX, clientY: curY, doc };
  }

  // Realistic human click sequence dispatch (satisfies W3C, jQuery, Angular, React, and Edgenuity event listeners)
  async function dispatchRealisticClick(targetEl, localX, localY, triggeredBySimulateClick = false) {
    if (!targetEl) return false;
    const doc = targetEl.ownerDocument || document;
    const win = doc.defaultView || window;

    const rect = targetEl.getBoundingClientRect();
    const clickX = typeof localX === 'number' ? localX : (rect.left + rect.width / 2);
    const clickY = typeof localY === 'number' ? localY : (rect.top + rect.height / 2);

    // If not triggered directly by simulateClick (e.g. invoked via selector or advanceNextButton),
    // glide the virtual cursor to the element and show click pulse ring
    if (!triggeredBySimulateClick) {
      const topCoords = getTopCoordinates(targetEl, clickX, clickY);
      await moveCursorNaturally(topCoords.x, topCoords.y, 220);
      flashClickEffect(topCoords.x, topCoords.y);
    }

    const eventInitCommon = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
      clientX: clickX,
      clientY: clickY,
      screenX: (win.screenX || 0) + clickX,
      screenY: (win.screenY || 0) + clickY,
    };

    const pointerDownInit = {
      ...eventInitCommon,
      button: 0,
      buttons: 1, // MANDATORY for browser hit-test
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      pressure: 0.5,
    };

    const pointerUpInit = {
      ...eventInitCommon,
      button: 0,
      buttons: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      pressure: 0,
    };

    const mouseDownInit = {
      ...eventInitCommon,
      button: 0,
      buttons: 1,
    };

    const mouseUpInit = {
      ...eventInitCommon,
      button: 0,
      buttons: 0,
    };

    // 1. Hover & Pointer Enter
    try {
      targetEl.dispatchEvent(new PointerEvent('pointerover', pointerDownInit));
      targetEl.dispatchEvent(new MouseEvent('mouseover', mouseDownInit));
      targetEl.dispatchEvent(new PointerEvent('pointerenter', pointerDownInit));
      targetEl.dispatchEvent(new MouseEvent('mouseenter', mouseDownInit));
    } catch {}

    // 2. Focus element
    if (typeof targetEl.focus === 'function') {
      try { targetEl.focus(); } catch {}
    }

    // 3. PointerDown & MouseDown (buttons: 1)
    try {
      targetEl.dispatchEvent(new PointerEvent('pointerdown', pointerDownInit));
      targetEl.dispatchEvent(new MouseEvent('mousedown', mouseDownInit));
    } catch {}

    await new Promise((r) => setTimeout(r, 40));

    // 4. PointerUp & MouseUp (buttons: 0)
    try {
      targetEl.dispatchEvent(new PointerEvent('pointerup', pointerUpInit));
      targetEl.dispatchEvent(new MouseEvent('mouseup', mouseUpInit));
    } catch {}

    // 5. Click event
    try {
      targetEl.dispatchEvent(new MouseEvent('click', mouseUpInit));
    } catch {}

    // 6. Direct DOM element.click()
    if (typeof targetEl.click === 'function') {
      try { targetEl.click(); } catch {}
    }

    // 7. Find associated radio / checkbox input in this frame
    let input = targetEl.tagName === 'INPUT' ? targetEl : targetEl.querySelector('input[type="radio"], input[type="checkbox"]');
    if (!input && targetEl.tagName === 'LABEL' && targetEl.htmlFor) {
      input = doc.getElementById(targetEl.htmlFor);
    }
    if (!input) {
      const parentChoice = targetEl.closest('.answer-choice, .answer-choice-button, li, [role="radio"], .choice');
      if (parentChoice) {
        input = parentChoice.querySelector('input[type="radio"], input[type="checkbox"]');
      }
    }

    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      try { input.click(); } catch {}
    }

    // 8. Find associated label in this frame
    const label = targetEl.tagName === 'LABEL' ? targetEl : (input?.id ? doc.querySelector(`label[for="${input.id}"]`) : targetEl.closest('label'));
    if (label && label !== targetEl) {
      try { label.click(); } catch {}
    }

    // 9. If element is an anchor or inside an anchor (e.g. Edgenuity .FrameRight or navnext)
    const anchor = targetEl.tagName === 'A' ? targetEl : targetEl.closest('a');
    if (anchor && anchor !== targetEl) {
      try { anchor.click(); } catch {}
      if (anchor.href && anchor.href.startsWith('javascript:')) {
        try { win.eval(anchor.href.replace(/^javascript:/, '')); } catch {}
      }
    }

    // 10. Direct jQuery trigger if jQuery is present (Edgenuity uses jQuery extensively in stageFrame)
    if (win && (win.jQuery || win.$)) {
      try {
        const jq = win.jQuery || win.$;
        jq(targetEl).trigger('click');
        if (input) jq(input).prop('checked', true).trigger('change').trigger('click');
        if (anchor) jq(anchor).trigger('click');
      } catch {}
    }

    return true;
  }

  // Simulate click: Combines CDP hardware click with deep DOM penetration
  async function simulateClick(x, y, label = '') {
    if (isNaN(x) || isNaN(y)) return false;

    // Purge any lingering text HUD cards/badges
    removeAllHudElements();

    // Position virtual cursor & flash expanding pulse ring
    const cursor = ensureVirtualCursor();
    if (cursor) {
      cursor.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      touchCursorVisibility(cursor);
    }
    flashClickEffect(x, y);

    // 1. Primary Strategy: Hardware Click via Chrome DevTools Protocol (CDP Debugger with buttons: 1)
    let nativeClicked = false;
    try {
      const cdpRes = await chrome.runtime.sendMessage({
        action: 'PERFORM_NATIVE_CLICK',
        x,
        y,
        label,
      });
      nativeClicked = !!cdpRes?.success;
    } catch (e) {
      // CDP bridge fallback
    }

    // 2. Secondary Strategy: Deep Frame Penetrating Realistic DOM Dispatch
    const resolved = resolveInteractiveElement(x, y);
    const targetEl = resolved?.element;
    const elemName = targetEl ? targetEl.tagName.toLowerCase() : 'unknown';
    const textSnippet = targetEl ? (targetEl.innerText || targetEl.textContent || '').trim().slice(0, 35) : '';

    // STRICT REQUIREMENT: Output coordinates strictly to the console!
    console.log(
      `%c[AutoSolve AI][CLICK] Clicked at coordinate (X: ${Math.round(x)}px, Y: ${Math.round(y)}px)${label ? ` for [${label}]` : ''} on <${elemName}> "${textSnippet}" [CDP isTrusted: ${nativeClicked ? 'true' : 'synthetic'}]`,
      'color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;'
    );
    addLog('CLICK', `Clicked (X: ${Math.round(x)}px, Y: ${Math.round(y)}px)${label ? ` [${label}]` : ''} ${nativeClicked ? '(Hardware isTrusted: true)' : ''}`);

    if (targetEl) {
      await dispatchRealisticClick(targetEl, resolved.clientX, resolved.clientY, true);
      return true;
    }

    return nativeClicked;
  }

  // Edgenuity & LMS Option Selector: Directly clicks the center of option textboxes across all frames
  async function selectAnswerChoice(opt, index) {
    const docs = getAllDocuments();
    const cleanTargetText = (opt?.text || '').trim().toLowerCase();

    console.log(`[AutoSolve AI][ANSWER] Selecting choice ${index + 1} ("${opt?.text}") across all frames...`);

    for (const doc of docs) {
      // 1. Text match on container, label, or choice row (clicks the center of the textbox)
      if (cleanTargetText && cleanTargetText.length > 1) {
        const candidates = Array.from(
          doc.querySelectorAll('.answer-choice, .answer-choice-button, .mc-choice, label, li.choice, .choice-container, div[data-choice], .choice, li, p')
        );
        for (const el of candidates) {
          const txt = (el.innerText || '').trim().toLowerCase();
          if (txt === cleanTargetText || (txt.length < 200 && (txt.includes(cleanTargetText) || cleanTargetText.includes(txt)))) {
            console.log(`[AutoSolve AI][ANSWER] Found text-matched option textbox in frame:`, el);
            await dispatchRealisticClick(el);
            return true;
          }
        }
      }

      // 2. Match Edgenuity choice container by index (.answer-choice, .choice, etc. - full textbox)
      const choiceContainers = Array.from(
        doc.querySelectorAll('.answer-choice, .answer-choice-button, .mc-choice, li.choice, .choice-container, div[data-choice], .choice, [role="radio"]')
      );
      if (choiceContainers.length > index && choiceContainers.length <= 12) {
        const choice = choiceContainers[index];
        console.log(`[AutoSolve AI][ANSWER] Found choice textbox container at index ${index} in frame:`, choice);
        await dispatchRealisticClick(choice);
        return true;
      }

      // 3. Match radio/checkbox input by index, but click its parent textbox/label rather than just the corner icon
      const radios = Array.from(doc.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
      if (radios.length > index && radios.length <= 12) {
        const radio = radios[index];
        const parentBox =
          radio.closest('label, .answer-choice, .answer-choice-button, .mc-choice, li, .choice') ||
          (radio.id ? doc.querySelector(`label[for="${radio.id}"]`) : null);
        const targetToClick = parentBox || radio;
        console.log(`[AutoSolve AI][ANSWER] Found option textbox for radio at index ${index}:`, targetToClick);
        await dispatchRealisticClick(targetToClick);
        return true;
      }
    }

    return false;
  }

  // Handle Dropdown Menu Selection across all frames (supports native <select> and custom comboboxes)
  async function handleDropdownSelection(dropdown, index) {
    const targetAnswer = (dropdown.selectedAnswer || dropdown.text || '').trim().toLowerCase();
    const rawX = dropdown.coordinates?.xPercent;
    const rawY = dropdown.coordinates?.yPercent;
    const targetX = typeof rawX === 'number' ? (rawX / 100) * window.innerWidth : null;
    const targetY = typeof rawY === 'number' ? (rawY / 100) * window.innerHeight : null;

    console.log(`[AutoSolve AI][DROPDOWN] Selecting "${dropdown.selectedAnswer || dropdown.text}" for dropdown ${index + 1}...`);
    addLog('DROPDOWN', `Selecting "${dropdown.selectedAnswer || dropdown.text}" for dropdown ${index + 1}`);

    const docs = getAllDocuments();

    // 1. Check for native <select> elements across all frames
    const allSelects = docs.flatMap((d) => Array.from(d.querySelectorAll('select')));
    if (allSelects.length > 0) {
      // Find matching select element by index or vertical position
      let targetSelect = allSelects.length > index ? allSelects[index] : allSelects[0];

      if (targetY !== null) {
        let bestDist = Infinity;
        for (const s of allSelects) {
          const rect = s.getBoundingClientRect();
          const dist = Math.abs((rect.top + rect.height / 2) - targetY);
          if (dist < bestDist && dist < 120) {
            bestDist = dist;
            targetSelect = s;
          }
        }
      }

      if (targetSelect) {
        // Find matching option in the select element
        const matchedOpt = Array.from(targetSelect.options).find((o) => {
          const oText = (o.text || o.label || o.value || '').trim().toLowerCase();
          return oText === targetAnswer ||
                 (targetAnswer && (oText.includes(targetAnswer) || targetAnswer.includes(oText)));
        });

        if (matchedOpt) {
          console.log(`[AutoSolve AI][DROPDOWN] Matched option "${matchedOpt.text}" in <select>:`, targetSelect);
          targetSelect.selectedIndex = matchedOpt.index;
          targetSelect.value = matchedOpt.value;
          targetSelect.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          targetSelect.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

          const win = targetSelect.ownerDocument?.defaultView || window;
          if (win && (win.jQuery || win.$)) {
            try { (win.jQuery || win.$)(targetSelect).val(matchedOpt.value).trigger('change'); } catch {}
          }

          // Visual feedback on the select box
          const sRect = targetSelect.getBoundingClientRect();
          const cx = sRect.left + sRect.width / 2;
          const cy = sRect.top + sRect.height / 2;
          await moveCursorNaturally(cx, cy, 220);
          flashClickEffect(cx, cy);
          return true;
        }
      }
    }

    // 2. Custom Clickable Dropdown / Combobox:
    // Click on the dropdown box at target coordinates, wait for popup list, and click matching option
    if (targetX !== null && targetY !== null) {
      await moveCursorNaturally(targetX, targetY, 300);
      await simulateClick(targetX, targetY, `Open Dropdown ${index + 1}`);
      await new Promise((r) => setTimeout(r, 350));

      // Search for the newly visible dropdown option items
      for (const doc of docs) {
        const optionCandidates = Array.from(
          doc.querySelectorAll(
            '[role="option"], .dropdown-item, .uilib-dropdown-item, .select-option, li, div.option, a.dropdown-item, span.option-text'
          )
        ).filter((el) => el.offsetParent !== null); // visible only

        const matchingEl = optionCandidates.find((el) => {
          const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
          return txt === targetAnswer ||
                 (targetAnswer && (txt.includes(targetAnswer) || targetAnswer.includes(txt)));
        });

        if (matchingEl) {
          console.log(`[AutoSolve AI][DROPDOWN] Found opened option item:`, matchingEl);
          const oRect = matchingEl.getBoundingClientRect();
          const ocx = oRect.left + oRect.width / 2;
          const ocy = oRect.top + oRect.height / 2;
          await moveCursorNaturally(ocx, ocy, 220);
          await simulateClick(ocx, ocy, `Option: ${matchingEl.innerText?.trim()}`);
          return true;
        }
      }
    }

    return false;
  }

  // Pre-advance: Check if Edgenuity requires "Check Answer" or "Submit" to unlock Next button
  async function checkOrSubmitAnswer() {
    const docs = getAllDocuments();
    const checkSelectors = [
      '#btnCheck',
      'input#btnCheck',
      '.btnCheck',
      'input[value*="Check" i]',
      'button[id*="Check" i]',
      '.CheckAnswer',
      '#btnSubmit',
      'input#btnSubmit',
      '.btnSubmit',
      'input[value*="Submit" i]',
      'button.uilib-btn-primary',
    ];

    for (const doc of docs) {
      for (const sel of checkSelectors) {
        const el = doc.querySelector(sel);
        if (el && el.offsetParent !== null) {
          console.log(`[AutoSolve AI][CHECK] Found Check/Submit button ("${sel}"):`, el);
          await dispatchRealisticClick(el);
          return true;
        }
      }
    }
    return false;
  }

  // Edgenuity & LMS Next Button Advance: Targets .FrameRight, .navnext, .navsave, #btnNext, window.Stage.Navigation
  async function advanceNextButton() {
    console.log('[AutoSolve AI][NEXT] Searching for Next/Submit buttons across all frames...');
    removeAllHudElements();

    const docs = getAllDocuments();

    // Strategy 1: Edgenuity-specific DOM selectors
    const edgenuitySelectors = [
      '.FrameRight',
      '.FrameRight a',
      '#stageFrame .FrameRight',
      '.footernav.navnext a',
      'a.footernav.navnext',
      'li.footernav.navnext a',
      '.footernav.navnext',
      'li.footernav.navnext',
      '.footernav.navsave a',
      'a.footernav.navsave',
      'li.footernav.navsave a',
      '#btnNext',
      'input#btnNext',
      '.btnNext',
      '.stage-footer .navnext',
      '.stage-footer .navsave',
      '.uilib-btn-next',
      '.uilib-btn-primary',
      'button.uilib-btn-primary',
      '.invis-next',
      'a[title*="Next" i]',
      'button[title*="Next" i]',
      'input[value*="Next" i]',
      'input[value*="Continue" i]',
    ];

    for (const doc of docs) {
      for (const sel of edgenuitySelectors) {
        const el = doc.querySelector(sel);
        if (el && el.offsetParent !== null) {
          console.log(`[AutoSolve AI][NEXT] Found Next button with selector "${sel}" in frame:`, el);
          await dispatchRealisticClick(el);
          return true;
        }
      }
    }

    // Strategy 2: Search via stageFrame jQuery or contentWindow directly
    try {
      const stageFrame = document.querySelector('#stageFrame');
      if (stageFrame) {
        const sfWin = stageFrame.contentWindow;
        const sfDoc = stageFrame.contentDocument || sfWin?.document;
        if (sfDoc) {
          const fr = sfDoc.querySelector('.FrameRight, .navnext, #btnNext');
          if (fr) {
            console.log('[AutoSolve AI][NEXT] Found Next button inside stageFrame:', fr);
            await dispatchRealisticClick(fr);
            return true;
          }
        }
        if (sfWin && (sfWin.$ || sfWin.jQuery)) {
          const jq = sfWin.$ || sfWin.jQuery;
          if (jq('.FrameRight').length > 0) {
            console.log('[AutoSolve AI][NEXT] Triggering stageFrame jQuery .FrameRight click');
            jq('.FrameRight').trigger('click');
            return true;
          }
        }
      }
    } catch {}

    // Strategy 3: Direct Edgenuity Navigation API
    try {
      const winTargets = [window, window.parent, window.top];
      for (const w of winTargets) {
        if (w?.Stage?.Navigation?.next) {
          console.log('[AutoSolve AI][NEXT] Invoking window.Stage.Navigation.next()');
          w.Stage.Navigation.next();
          return true;
        }
        if (w?.API?.Next) {
          console.log('[AutoSolve AI][NEXT] Invoking window.API.Next()');
          w.API.Next();
          return true;
        }
      }
    } catch {}

    // Strategy 4: General text-matched buttons across all frames
    for (const doc of docs) {
      const buttons = Array.from(doc.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"], div.button'));
      const matched = buttons.find((el) => {
        const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase().trim();
        return /^(next|continue|submit|finish|proceed|advance)$/i.test(text) ||
               /next|continue/i.test(text);
      });
      if (matched && matched.offsetParent !== null) {
        console.log('[AutoSolve AI][NEXT] Found text-matched Next button in frame:', matched);
        await dispatchRealisticClick(matched);
        return true;
      }
    }

    return false;
  }

  function setVideoBoost(enabled, speed = 16.0) {
    const docs = getAllDocuments();
    const videos = docs.flatMap((d) => Array.from(d.querySelectorAll('video')));
    if (!videos.length) {
      addLog('VIDEO', 'No HTML5 video element detected across accessible frames');
      return { success: false, count: 0 };
    }
    videos.forEach((video) => { video.playbackRate = enabled ? speed : 1.0; });
    addLog('VIDEO', enabled
      ? `Video boost enabled: ${videos.length} video(s) set to ${speed}x.`
      : `Video boost disabled: ${videos.length} video(s) reset to 1x.`);
    return { success: true, count: videos.length };
  }

  async function accelerateVideos(speed = 16.0, triggerNext = true, nextCoords = null) {
    const docs = getAllDocuments();
    const videos = docs.flatMap((d) => Array.from(d.querySelectorAll('video')));

    if (!videos.length) {
      addLog('VIDEO', 'No HTML5 video element detected across any frames');
      return false;
    }

    videos.forEach((v) => {
      v.playbackRate = speed;
      if (v.paused) v.play().catch(() => {});
    });

    console.log(`%c[AutoSolve AI][VIDEO] Accelerated ${videos.length} video(s) across all frames to ${speed}x!`, 'color: #9333ea; font-weight: bold;');
    addLog('VIDEO', `Accelerated ${videos.length} video(s) to ${speed}x!`);

    if (triggerNext) {
      let remaining = 15;
      const interval = setInterval(async () => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(interval);
          addLog('VIDEO', '15s video timer elapsed: Advancing to next activity...');
          if (nextCoords && typeof nextCoords.xPercent === 'number') {
            const nx = (nextCoords.xPercent / 100) * window.innerWidth;
            const ny = (nextCoords.yPercent / 100) * window.innerHeight;
            await moveCursorNaturally(nx, ny, 300);
            await simulateClick(nx, ny, 'Next Button');
          }
          await advanceNextButton();
        }
      }, 1000);
    }
    return true;
  }

  async function executeSolution(analysis, options = {}) {
    if (state.isExecuting) {
      console.warn('[AutoSolve AI] Execution already in progress. Resetting state to handle new action.');
    }

    state.isExecuting = true;
    removeAllHudElements();

    if (state.watchdogTimer) clearTimeout(state.watchdogTimer);
    state.watchdogTimer = setTimeout(() => {
      if (state.isExecuting) {
        console.warn('[AutoSolve AI] Watchdog: Resetting execution lock after 10s timeout.');
        state.isExecuting = false;
      }
    }, 10000);

    let clicksPerformed = 0;

    try {
      // 1. Check for video modules
      if (analysis.hasVideo) {
        await accelerateVideos(16.0, true, analysis.nextButton?.coordinates);
        state.isExecuting = false;
        clearTimeout(state.watchdogTimer);
        return { success: true, mode: 'video', clicksPerformed: 0 };
      }

      const allOptions = analysis.options || [];

      // STRICT REQUIREMENT: Output coordinates strictly to the console!
      console.group('%c[AutoSolve AI] Retrieved Answers and Coordinates from Gemini', 'color: #2563eb; font-weight: bold; font-size: 13px;');
      console.log(`Question: "${analysis.question || 'N/A'}" (Type: ${analysis.questionType || 'unknown'})`);
      console.log(`Reasoning: ${analysis.conciseReasoning || 'N/A'}`);

      allOptions.forEach((opt, idx) => {
        const isCorrect = !!opt.isCorrect;
        const optNum = typeof opt.number === 'number' ? opt.number : (idx + 1);
        const optLetter = opt.letter || String.fromCharCode(65 + idx);
        const xPct = typeof opt.coordinates?.xPercent === 'number' ? opt.coordinates.xPercent : (opt.coordinates?.x ?? 50);
        const yPct = typeof opt.coordinates?.yPercent === 'number' ? opt.coordinates.yPercent : (opt.coordinates?.y ?? 50);
        const xPx = Math.round((xPct / 100) * window.innerWidth);
        const yPx = Math.round((yPct / 100) * window.innerHeight);

        const badge = isCorrect ? '✅ [CORRECT ANSWER]' : '❌ [INCORRECT]';
        const color = isCorrect ? 'color: #16a34a; font-weight: bold;' : 'color: #64748b;';

        console.log(
          `%c${badge} Option [${optNum}] (${optLetter}): "${opt.text}" -> Coordinates: X=${xPx}px (${xPct.toFixed(1)}%), Y=${yPx}px (${yPct.toFixed(1)}%)`,
          color
        );

        if (isCorrect) {
          console.log(
            `%c👉 SCREENSHOT ANSWER [${optNum}] (${optLetter}): "${opt.text}"`,
            'color: #10b981; font-weight: bold; font-size: 13px; background: #064e3b; padding: 2px 8px; border-radius: 4px;'
          );
          addLog('CLICK', `👉 SCREENSHOT ANSWER [${optNum}] (${optLetter}): "${opt.text}"`);
          addLog('COORDINATES', `Option [${optNum}] (${optLetter}) at (${xPct.toFixed(1)}%, ${yPct.toFixed(1)}%)`);
        }
      });

      if (analysis.nextButton?.detected || analysis.nextButton?.coordinates) {
        const nxPct = analysis.nextButton.coordinates?.xPercent ?? 88;
        const nyPct = analysis.nextButton.coordinates?.yPercent ?? 88;
        const nxPx = Math.round((nxPct / 100) * window.innerWidth);
        const nyPx = Math.round((nyPct / 100) * window.innerHeight);

        console.log(
          `%c[AutoSolve AI][COORDINATES] Next/Submit Button -> X=${nxPx}px (${nxPct.toFixed(1)}%), Y=${nyPx}px (${nyPct.toFixed(1)}%)`,
          'color: #0284c7; font-weight: bold;'
        );
        addLog('COORDINATES', `Next Button at X=${nxPx}px (${nxPct.toFixed(1)}%), Y=${nyPx}px (${nyPct.toFixed(1)}%)`);
      }
      console.groupEnd();

      // 2. Check for Dropdown Questions
      const dropdowns = (Array.isArray(analysis.dropdowns) && analysis.dropdowns.length > 0)
        ? analysis.dropdowns
        : (analysis.questionType === 'dropdown' ? analysis.options : null);

      if (dropdowns && dropdowns.length > 0) {
        console.log(`[AutoSolve AI] Detected Dropdown question with ${dropdowns.length} menu(s). Processing...`);
        addLog('DROPDOWN', `Detected ${dropdowns.length} dropdown menu(s) to solve.`);

        for (let d = 0; d < dropdowns.length; d++) {
          const dd = dropdowns[d];
          const selected = await handleDropdownSelection(dd, d);
          if (selected) clicksPerformed++;
          await new Promise((r) => setTimeout(r, 350));
        }

        // Check or Submit answer if required
        await new Promise((r) => setTimeout(r, 300));
        await checkOrSubmitAnswer();

        // Auto-Click Next / Submit if enabled
        if (options.autoClickNext !== false) {
          await new Promise((r) => setTimeout(r, 400));

          let nextClicked = false;
          if (analysis.nextButton?.coordinates && typeof analysis.nextButton.coordinates.xPercent === 'number') {
            const nx = (analysis.nextButton.coordinates.xPercent / 100) * window.innerWidth;
            const ny = (analysis.nextButton.coordinates.yPercent / 100) * window.innerHeight;
            await moveCursorNaturally(nx, ny, 300);
            nextClicked = await simulateClick(nx, ny, 'Next / Submit Button');
            if (nextClicked) clicksPerformed++;
          }

          const advanced = await advanceNextButton();
          if (advanced && !nextClicked) clicksPerformed++;
        }

        return { success: true, mode: 'dropdown', clicksPerformed };
      }

      // 3. Identify correct options (standard single/multiple choice)
      let correctOptions = allOptions.filter((o) => o.isCorrect);

      if (correctOptions.length === 0 && allOptions.length > 0) {
        console.warn('[AutoSolve AI] No option explicitly marked isCorrect: true. Selecting top confidence option as fallback.');
        const sorted = [...allOptions].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        correctOptions = [sorted[0]];
      }

      // 3. Click each correct option
      for (let i = 0; i < correctOptions.length; i++) {
        const opt = correctOptions[i];
        let xPct = opt.coordinates?.xPercent ?? opt.coordinates?.x ?? 50;
        let yPct = opt.coordinates?.yPercent ?? opt.coordinates?.y ?? 50;

        const targetX = (xPct / 100) * window.innerWidth;
        const targetY = (yPct / 100) * window.innerHeight;

        await moveCursorNaturally(targetX, targetY, 300);
        const optNum = opt.number || (allOptions.indexOf(opt) + 1);
        const optLetter = opt.letter || String.fromCharCode(64 + optNum);
        console.log(
          `%c[AutoSolve AI][CLICK] Clicked Option [${optNum}] (${optLetter}) -> "${opt.text}" at (X: ${Math.round(targetX)}px, Y: ${Math.round(targetY)}px)`,
          'color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;'
        );
        await simulateClick(targetX, targetY, `Option [${optNum}] (${optLetter})`);
        clicksPerformed++;

        // Guarantee Edgenuity answer selection across frames using original choice index
        const originalIndex = allOptions.findIndex(
          (o) => o === opt || (o.text && opt.text && o.text.trim().toLowerCase() === opt.text.trim().toLowerCase())
        );
        const choiceIndex = originalIndex >= 0 ? originalIndex : i;
        await selectAnswerChoice(opt, choiceIndex);

        if (i < correctOptions.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // 4. Edgenuity Check / Submit (some activities require clicking Check before Next unlocks)
      await new Promise((r) => setTimeout(r, 250));
      await checkOrSubmitAnswer();

      // 5. Auto-Click Next / Submit if enabled
      if (options.autoClickNext !== false) {
        await new Promise((r) => setTimeout(r, 400));

        let nextClicked = false;
        if (analysis.nextButton?.coordinates && typeof analysis.nextButton.coordinates.xPercent === 'number') {
          const nx = (analysis.nextButton.coordinates.xPercent / 100) * window.innerWidth;
          const ny = (analysis.nextButton.coordinates.yPercent / 100) * window.innerHeight;
          await moveCursorNaturally(nx, ny, 300);
          nextClicked = await simulateClick(nx, ny, 'Next / Submit Button');
          if (nextClicked) clicksPerformed++;
        }

        // Always trigger Edgenuity Next advance (.FrameRight, stageFrame, .navnext, window.Stage.Navigation)
        const advanced = await advanceNextButton();
        if (advanced && !nextClicked) clicksPerformed++;
      }

      return { success: true, clicksPerformed };
    } catch (err) {
      console.error('[AutoSolve AI] executeSolution error:', err);
      addLog('ERROR', `Execution error: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      if (state.watchdogTimer) clearTimeout(state.watchdogTimer);
      state.isExecuting = false;
      removeAllHudElements();
    }
  }

  // Visual highlighter: Highlights all text across document & iframes with real browser selection + banner
  function highlightAllTextOnPage() {
    const docs = getAllDocuments();
    for (const doc of docs) {
      try {
        const win = doc.defaultView || window;
        const sel = win.getSelection ? win.getSelection() : window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          const target = doc.querySelector('#stageFrame, .stageFrame, #activity-container, .main-content, #content, main') || doc.body;
          if (target) {
            const range = doc.createRange();
            range.selectNodeContents(target);
            sel.addRange(range);
          }
        }
      } catch (e) {
        console.warn('[AutoSolve AI] Text highlight notice:', e);
      }
    }

    // Show stylish non-intrusive notification badge on active page
    try {
      let badge = document.getElementById('autosolve-copy-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'autosolve-copy-badge';
        document.body.appendChild(badge);
      }
      badge.style.cssText = `
        position: fixed !important;
        top: 18px !important;
        right: 18px !important;
        z-index: 2147483647 !important;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
        color: #ffffff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        padding: 10px 18px !important;
        border-radius: 10px !important;
        box-shadow: 0 10px 25px rgba(0,0,0,0.35), 0 0 16px rgba(16,185,129,0.5) !important;
        pointer-events: none !important;
        transition: opacity 0.3s ease, transform 0.3s ease !important;
        opacity: 1 !important;
        transform: translateY(0) scale(1) !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      `;
      badge.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        <span>Entire Page Highlighted & Auto-Copied</span>
      `;
      setTimeout(() => {
        if (badge) {
          badge.style.opacity = '0';
          badge.style.transform = 'translateY(-10px) scale(0.95)';
          setTimeout(() => badge.remove(), 400);
        }
      }, 2200);
    } catch {}
  }

  // Intelligent Question & Choice Extractor (traverses Edgenuity stageFrame, nested iframes & DOM)
  function extractPageQuestionAndChoices() {
    // 1. Visually highlight all text across document & nested stageFrame
    highlightAllTextOnPage();

    // 2. Check if user selected text with mouse cursor
    let selectedText = '';
    try {
      selectedText = window.getSelection()?.toString()?.trim() || '';
      if (!selectedText) {
        const docs = getAllDocuments();
        for (const d of docs) {
          const sel = d.getSelection?.()?.toString()?.trim();
          if (sel) { selectedText = sel; break; }
        }
      }
    } catch {}

    if (selectedText && selectedText.length > 8) {
      return {
        source: 'user_selection',
        text: selectedText,
      };
    }

    // 3. Scan documents (including Edgenuity stageFrame and activity containers)
    const docs = getAllDocuments();
    let bestQuestion = '';
    let choices = [];
    let dropdowns = [];
    let largestStageText = '';
    const pageTexts = [];

    for (const doc of docs) {
      if (!doc || !doc.body) continue;

      // Extract full text of stage / main content / body (UNTRUNCATED)
      const stage = doc.querySelector('#stageFrame, .stageFrame, #activity-container, .main-content, #content, main') || doc.body;
      // Capture the full visible document, not only the largest question/activity container.
      const stageText = (doc.body?.innerText || stage?.innerText || '').trim();
      if (stageText) pageTexts.push(stageText);

      // Question prompts
      const qSelectors = [
        '.QuestionText',
        '.question_text',
        '.question-prompt',
        '.prompt',
        '.assessment-question',
        '.question-container p',
        '.questionText',
        '.question',
        '[data-testid="question-title"]',
        '.form-prompt',
        'h3.question',
        '.reading-passage',
        '#questionText',
        '.instruction-text',
      ];

      for (const sel of qSelectors) {
        const els = doc.querySelectorAll(sel);
        for (const el of els) {
          const txt = el.innerText?.trim();
          if (txt && txt.length > 15 && (!bestQuestion || txt.length > bestQuestion.length)) {
            bestQuestion = txt;
          }
        }
      }

      // Choice containers
      const cSelectors = [
        '.answer-choice',
        '.choice-container',
        '.Option',
        '.answer_label',
        'label.choice',
        'li.choice',
        '.option-text',
        '.mc-option',
        'table.options td',
        '.answer-option',
      ];

      for (const sel of cSelectors) {
        const els = doc.querySelectorAll(sel);
        if (els.length >= 2) {
          const extracted = Array.from(els)
            .map((el) => el.innerText?.trim())
            .filter((t) => t && t.length > 0 && !t.startsWith('Choose'));
          if (extracted.length >= 2 && extracted.length > choices.length) {
            choices = extracted;
          }
        }
      }

      // <select> dropdowns
      const selects = doc.querySelectorAll('select');
      if (selects.length > 0) {
        selects.forEach((s, idx) => {
          const optTexts = Array.from(s.options).map((o) => o.text.trim()).filter((t) => t && !t.includes('Select'));
          const parentLabel = s.closest('label, p, div')?.innerText?.split('\n')[0] || `Dropdown ${idx + 1}`;
          dropdowns.push(`Dropdown [${idx + 1}] (${parentLabel}): Options: [${optTexts.join(' | ')}]`);
        });
      }
    }

    // Combine every accessible document/frame while removing exact duplicate frame content.
    const seenPageTexts = new Set();
    largestStageText = pageTexts.filter(text => {
      const key = text.replace(/\s+/g, ' ').toLowerCase();
      if (seenPageTexts.has(key)) return false;
      seenPageTexts.add(key);
      return true;
    }).join('\n\n===== EMBEDDED FRAME =====\n\n');

    // 4. Assemble structured question text without ANY artificial character limits
    let assembled = '';

    // If largestStageText has rich content (reading passages + questions + choices), preserve it completely
    if (largestStageText && largestStageText.length > 80) {
      assembled = largestStageText;

      // If specific multiple-choice elements were detected that might not be clearly labeled in raw text, append them
      if (choices.length > 0 && !assembled.includes(choices[0])) {
        assembled += '\n\n=== MULTIPLE CHOICE OPTIONS ===\n';
        choices.forEach((c, idx) => {
          const letter = String.fromCharCode(65 + idx);
          assembled += `[${idx + 1}] (${letter}) ${c}\n`;
        });
      }

      if (dropdowns.length > 0 && !assembled.includes('Dropdown [1]')) {
        assembled += `\n\n=== DROPDOWNS ===\n${dropdowns.join('\n')}\n`;
      }
    } else if (bestQuestion) {
      assembled = `${bestQuestion}\n\n`;
      if (choices.length > 0) {
        choices.forEach((c, idx) => {
          const letter = String.fromCharCode(65 + idx);
          assembled += `[${idx + 1}] (${letter}) ${c}\n`;
        });
      }
      if (dropdowns.length > 0) {
        assembled += `\n${dropdowns.join('\n')}\n`;
      }
    } else {
      assembled = document.body.innerText?.trim() || '';
    }

    return {
      source: 'entire_page_highlighted',
      text: assembled.trim(),
    };
  }

  // Expose global execution methods so background can invoke in every frame
  window.__AUTOSOLVE_EXECUTE_IN_FRAME__ = (analysis, options) => {
    return executeSolution(analysis, options);
  };
  window.__AUTOSOLVE_ADVANCE_NEXT__ = () => {
    return advanceNextButton();
  };
  window.__AUTOSOLVE_CLEANUP_HUD__ = () => {
    removeAllHudElements();
  };
  window.__AUTOSOLVE_GRAB_CONTENT__ = () => {
    return extractPageQuestionAndChoices();
  };

  // Message listener - responds asynchronously to background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXECUTE_SOLUTION') {
      executeSolution(request.analysis, request.options)
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    } else if (request.action === 'GRAB_PAGE_CONTENT' || request.action === 'AUTO_COPY_PAGE') {
      try {
        const extracted = extractPageQuestionAndChoices();
        if (extracted.text) {
          try {
            navigator.clipboard.writeText(extracted.text).catch(() => {});
          } catch {}
        }
        sendResponse({ success: true, ...extracted });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    } else if (request.action === 'SET_VIDEO_BOOST') {
      try {
        sendResponse(setVideoBoost(Boolean(request.enabled), Number(request.speed) || 16));
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    } else if (request.action === 'TRIGGER_MANUAL_NEXT') {
      advanceNextButton().then((clicked) => {
        sendResponse({ success: clicked });
      });
      return true;
    } else if (request.action === 'PING') {
      removeAllHudElements();
      sendResponse({ status: 'alive', injected: true });
      return true;
    }
  });

  console.log('%c[AutoSolve AI] Content Script Loaded & Cleaned (Zero-HUD Mode Active).', 'color: #3b82f6; font-weight: bold;');
})();