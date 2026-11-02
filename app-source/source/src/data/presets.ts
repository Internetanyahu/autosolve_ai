// Preloaded realistic quiz and assessment screens for testing AutoSolve AI

export interface PresetScenario {
  id: string;
  title: string;
  category: string;
  description: string;
  width: number;
  height: number;
  svgDataUri: string;
  expectedQuestion: string;
  expectedType: string;
}

function createSvgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'bio-mcq',
    title: 'Cellular Biology 101 - Multiple Choice',
    category: 'Higher Education',
    description: 'Standard single-choice question with 4 radio options and a Next Question button.',
    width: 1200,
    height: 750,
    expectedQuestion: 'Which organelle is primarily responsible for generating cellular ATP through oxidative phosphorylation?',
    expectedType: 'single_choice',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750" fill="#0f172a">
        <rect width="1200" height="750" fill="#090d16"/>
        <!-- Top bar -->
        <rect width="1200" height="56" fill="#1e293b"/>
        <text x="32" y="35" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">BioQuest Academy · Midterm Exam</text>
        <text x="1050" y="35" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13">Question 14 of 40</text>
        
        <!-- Main Quiz Card -->
        <rect x="180" y="100" width="840" height="520" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        
        <!-- Question Header -->
        <text x="220" y="150" fill="#64748b" font-family="system-ui, sans-serif" font-size="12" font-weight="600">MULTIPLE CHOICE QUESTION</text>
        <text x="220" y="190" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="18" font-weight="600">Which organelle is primarily responsible for generating cellular ATP</text>
        <text x="220" y="218" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="18" font-weight="600">through oxidative phosphorylation in eukaryotic cells?</text>
        
        <!-- Option A (Incorrect) -->
        <rect x="220" y="260" width="760" height="56" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <circle cx="250" cy="288" r="9" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="280" y="293" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="15">A. Endoplasmic reticulum (rough and smooth)</text>
        
        <!-- Option B (CORRECT: Mitochondria) -->
        <rect x="220" y="332" width="760" height="56" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <circle cx="250" cy="360" r="9" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="280" y="365" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="15" font-weight="500">B. Mitochondrion</text>
        
        <!-- Option C (Incorrect) -->
        <rect x="220" y="404" width="760" height="56" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <circle cx="250" cy="432" r="9" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="280" y="437" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="15">C. Golgi apparatus and cisternal vesicles</text>
        
        <!-- Option D (Incorrect) -->
        <rect x="220" y="476" width="760" height="56" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <circle cx="250" cy="504" r="9" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="280" y="509" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="15">D. Peroxisome catalase matrix</text>
        
        <!-- Next Button -->
        <rect x="830" y="555" width="150" height="42" rx="6" fill="#2563eb"/>
        <text x="872" y="581" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Next Question →</text>
      </svg>
    `),
  },
  {
    id: 'cloud-tf',
    title: 'Cloud Architecture - True / False',
    category: 'Technical Certification',
    description: 'Binary decision question testing rapid auto-solve and Next button trigger.',
    width: 1200,
    height: 750,
    expectedQuestion: 'In distributed computing, CAP theorem states that a system can simultaneously guarantee Consistency, Availability, and Partition Tolerance.',
    expectedType: 'true_false',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750" fill="#0f172a">
        <rect width="1200" height="750" fill="#0b1120"/>
        <!-- Header -->
        <rect width="1200" height="60" fill="#1e293b"/>
        <text x="40" y="38" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">Cloud Architects Certification · Section 4</text>
        <text x="1060" y="38" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13">Time Left: 42:15</text>
        
        <!-- Card -->
        <rect x="200" y="110" width="800" height="480" rx="12" fill="#131c2e" stroke="#1e293b" stroke-width="1"/>
        <text x="240" y="160" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold">STATEMENT VERIFICATION</text>
        <text x="240" y="200" fill="#ffffff" font-family="system-ui, sans-serif" font-size="18" font-weight="600">True or False: According to Eric Brewer's CAP Theorem,</text>
        <text x="240" y="230" fill="#ffffff" font-family="system-ui, sans-serif" font-size="18" font-weight="600">a distributed data store can simultaneously guarantee Consistency,</text>
        <text x="240" y="260" fill="#ffffff" font-family="system-ui, sans-serif" font-size="18" font-weight="600">Availability, and Partition Tolerance during network partitions.</text>
        
        <!-- Option True (Incorrect) -->
        <rect x="240" y="310" width="720" height="64" rx="8" fill="#0b1120" stroke="#1e293b" stroke-width="1"/>
        <circle cx="275" cy="342" r="10" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="310" y="348" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="16">True</text>
        
        <!-- Option False (CORRECT) -->
        <rect x="240" y="390" width="720" height="64" rx="8" fill="#0b1120" stroke="#1e293b" stroke-width="1"/>
        <circle cx="275" cy="422" r="10" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="310" y="428" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">False (Only 2 of the 3 can be satisfied simultaneously)</text>
        
        <!-- Submit Button -->
        <rect x="790" y="490" width="170" height="46" rx="6" fill="#0284c7"/>
        <text x="836" y="519" fill="#ffffff" font-family="system-ui, sans-serif" font-size="15" font-weight="600">Submit Answer</text>
      </svg>
    `),
  },
  {
    id: 'cyber-multi',
    title: 'Cybersecurity - Multi-Select Checkboxes',
    category: 'Corporate Compliance',
    description: 'Multiple choice question requiring clicking more than one checkbox before advancing.',
    width: 1200,
    height: 750,
    expectedQuestion: 'Which of the following are common red flags of a spear-phishing email? (Select all that apply)',
    expectedType: 'multiple_choice',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750" fill="#0f172a">
        <rect width="1200" height="750" fill="#090d16"/>
        <rect width="1200" height="56" fill="#1e293b"/>
        <text x="32" y="35" fill="#f59e0b" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">CyberSec Annual Training · Module 3</text>
        
        <rect x="180" y="90" width="840" height="550" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        <text x="220" y="135" fill="#f59e0b" font-family="system-ui, sans-serif" font-size="12" font-weight="bold">MULTI-SELECT (CHOOSE ALL CORRECT)</text>
        <text x="220" y="170" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="18" font-weight="600">Which of the following are recognized red flags indicating a phishing email?</text>
        
        <!-- Option 1 (CORRECT) -->
        <rect x="220" y="210" width="760" height="54" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <rect x="242" y="228" width="18" height="18" rx="3" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="278" y="242" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="14">Mismatched sender domain name (e.g. support@paypa1-security.com)</text>
        
        <!-- Option 2 (CORRECT) -->
        <rect x="220" y="276" width="760" height="54" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <rect x="242" y="294" width="18" height="18" rx="3" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="278" y="308" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="14">Artificial sense of extreme urgency threatening immediate account closure</text>
        
        <!-- Option 3 (Incorrect) -->
        <rect x="220" y="342" width="760" height="54" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <rect x="242" y="360" width="18" height="18" rx="3" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="278" y="374" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="14">A calendar invite sent by your verified company HR email address</text>
        
        <!-- Option 4 (CORRECT) -->
        <rect x="220" y="408" width="760" height="54" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <rect x="242" y="426" width="18" height="18" rx="3" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="278" y="440" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="14">Unsolicited attachments with macro-enabled files (.docm, .xlsm, .exe)</text>
        
        <!-- Option 5 (Incorrect) -->
        <rect x="220" y="474" width="760" height="54" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <rect x="242" y="492" width="18" height="18" rx="3" fill="none" stroke="#64748b" stroke-width="2"/>
        <text x="278" y="506" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="14">Standard plain text notification with no external hyperlinks</text>
        
        <!-- Submit Button -->
        <rect x="830" y="555" width="150" height="42" rx="6" fill="#d97706"/>
        <text x="862" y="581" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Submit All (3) →</text>
      </svg>
    `),
  },
  {
    id: 'video-lecture',
    title: 'Training Module - 16x Video Accelerator',
    category: 'Video Lecture',
    description: 'Mandatory video player page that AutoSolve AI detects and speeds up 16x before auto-advancing.',
    width: 1200,
    height: 750,
    expectedQuestion: 'Video Lecture Module: Mandatory Safety Compliance',
    expectedType: 'video_only',
    svgDataUri: createSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750" fill="#0f172a">
        <rect width="1200" height="750" fill="#0b0f19"/>
        <rect width="1200" height="56" fill="#1e293b"/>
        <text x="32" y="35" fill="#a855f7" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">OSHA Workplace Safety 2026 · Video Module 5</text>
        
        <!-- Video Player Mock -->
        <rect x="180" y="90" width="840" height="460" rx="10" fill="#020617" stroke="#334155" stroke-width="1"/>
        <circle cx="600" cy="300" r="44" fill="#a855f7" opacity="0.9"/>
        <polygon points="590,280 620,300 590,320" fill="#ffffff"/>
        <text x="600" y="380" text-anchor="middle" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="16">Mandatory Safety Protocols (Duration: 18:45)</text>
        
        <!-- Video Controls Bar -->
        <rect x="180" y="506" width="840" height="44" fill="#1e293b"/>
        <rect x="200" y="525" width="400" height="6" rx="3" fill="#3b82f6"/>
        <rect x="600" y="525" width="400" height="6" rx="3" fill="#475569"/>
        <text x="1005" y="531" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="12">02:14 / 18:45</text>
        
        <!-- Next Button (Disabled until completed, or AutoSolve AI advances) -->
        <rect x="830" y="575" width="190" height="46" rx="6" fill="#7c3aed"/>
        <text x="860" y="604" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Continue to Quiz →</text>
      </svg>
    `),
  },
];
