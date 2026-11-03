import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Server,
  Activity,
  Key,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Sliders,
  X,
  ShieldCheck,
  Cpu,
  Radio,
  ArrowRight,
  ExternalLink,
  Database,
  Timer,
  Flame,
  Trash2,
} from 'lucide-react';
import {
  ProviderId,
  CustomProviderConfig,
  ProviderCatalogItem,
  HealthCheckResult,
  GatewayTelemetryEvent,
  ModelLatencyMetric,
  CacheStats,
  BenchmarkReport,
} from '../types/api';
import {
  loadProviderConfig,
  saveProviderConfig,
  fetchProvidersCatalog,
  testProviderConnection,
  fetchGatewayTelemetry,
  fetchGeminiModelProfiles,
  fetchCacheStats,
  clearGatewayCache,
  runSpeedBenchmark,
} from '../services/apiGatewayService';
import { playTactileSound } from '../utils/audio';

interface ApiManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled?: boolean;
}

export const ApiManagementModal: React.FC<ApiManagementModalProps> = ({
  isOpen,
  onClose,
  soundEnabled = true,
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'keys' | 'pipeline' | 'cache' | 'benchmark' | 'telemetry'>('providers');
  const [config, setConfig] = useState<CustomProviderConfig>(loadProviderConfig);
  const [catalog, setCatalog] = useState<ProviderCatalogItem[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, HealthCheckResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [telemetry, setTelemetry] = useState<GatewayTelemetryEvent[]>([]);
  const [geminiProfiles, setGeminiProfiles] = useState<Record<string, ModelLatencyMetric>>({});
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isPurgingCache, setIsPurgingCache] = useState(false);
  const [benchmarkReport, setBenchmarkReport] = useState<BenchmarkReport | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCatalog();
      loadTelemetryData();
      loadGeminiProfiles();
      loadCacheData();
    }
  }, [isOpen]);

  const loadCatalog = async () => {
    const data = await fetchProvidersCatalog(config);
    setCatalog(data);
  };

  const loadCacheData = async () => {
    const data = await fetchCacheStats();
    if (data) setCacheStats(data);
  };

  const handlePurgeCache = async () => {
    playTactileSound('click', soundEnabled);
    setIsPurgingCache(true);
    try {
      const data = await clearGatewayCache();
      if (data) setCacheStats(data);
    } finally {
      setIsPurgingCache(false);
    }
  };

  const handleRunBenchmark = async () => {
    playTactileSound('click', soundEnabled);
    setIsRunningBenchmark(true);
    try {
      const report = await runSpeedBenchmark(config);
      if (report) {
        setBenchmarkReport(report);
        playTactileSound('glassChime', soundEnabled);
      }
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const loadTelemetryData = async () => {
    const data = await fetchGatewayTelemetry();
    setTelemetry(data);
  };

  const loadGeminiProfiles = async () => {
    const data = await fetchGeminiModelProfiles();
    setGeminiProfiles(data);
  };

  const handleTestProvider = async (providerId: ProviderId) => {
    playTactileSound('click', soundEnabled);
    setTestingId(providerId);
    try {
      const result = await testProviderConnection(providerId, config);
      setHealthMap((prev) => ({ ...prev, [providerId]: result }));
    } finally {
      setTestingId(null);
    }
  };

  const handleTestAll = async () => {
    playTactileSound('click', soundEnabled);
    setIsTestingAll(true);
    for (const p of catalog) {
      setTestingId(p.id);
      const res = await testProviderConnection(p.id, config);
      setHealthMap((prev) => ({ ...prev, [p.id]: res }));
    }
    setTestingId(null);
    setIsTestingAll(false);
    playTactileSound('glassChime', soundEnabled);
  };

  const handleSaveKey = (providerId: ProviderId, value: string) => {
    const updated = {
      ...config,
      customKeys: {
        ...config.customKeys,
        [providerId]: value.trim() ? value.trim() : undefined,
      },
    };
    setConfig(updated);
    saveProviderConfig(updated);
    triggerSavedNotice();
  };

  const handleSaveEndpoint = (providerId: ProviderId, value: string) => {
    const updated = {
      ...config,
      customEndpoints: {
        ...config.customEndpoints,
        [providerId]: value.trim() ? value.trim() : undefined,
      },
    };
    setConfig(updated);
    saveProviderConfig(updated);
    triggerSavedNotice();
  };

  const handleSetPrimary = (providerId: ProviderId) => {
    playTactileSound('click', soundEnabled);
    const updated = {
      ...config,
      preferredProvider: providerId,
    };
    setConfig(updated);
    saveProviderConfig(updated);
    triggerSavedNotice();
  };

  const handleModelChange = (providerId: ProviderId, model: string) => {
    playTactileSound('toggle', soundEnabled);
    const updated = {
      ...config,
      preferredModel: {
        ...config.preferredModel,
        [providerId]: model,
      },
    };
    setConfig(updated);
    saveProviderConfig(updated);
    triggerSavedNotice();
  };

  const handleToggleModelRouting = () => {
    playTactileSound('toggle', soundEnabled);
    const updated = {
      ...config,
      modelRouting: (config.modelRouting === 'manual' ? 'auto' : 'manual') as 'auto' | 'manual',
    };
    setConfig(updated);
    saveProviderConfig(updated);
    triggerSavedNotice();
  };

  const triggerSavedNotice = () => {
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const toggleKeyVisibility = (providerId: string) => {
    playTactileSound('toggle', soundEnabled);
    setVisibleKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 14 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl bg-zinc-950/85 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-zinc-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-purple-500/20 border border-white/15 flex items-center justify-center shadow-inner">
                <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-white">
                    Aetheria AI Gateway & Health Hub
                  </h2>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                    Self-Healing Active
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Multi-provider resilience, real-time connectivity probes & custom endpoint vault
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isSavedNotice && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved
                </motion.div>
              )}
              <button
                onClick={() => {
                  playTactileSound('click', soundEnabled);
                  onClose();
                }}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Bar with Mobile Horizontal Scroll */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-2.5 border-b border-white/10 bg-white/[0.01] gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { id: 'providers', label: 'Providers & Health', icon: Activity },
                { id: 'keys', label: 'API Keys & Vault', icon: Key },
                { id: 'pipeline', label: 'Failover Pipeline', icon: Sliders },
                { id: 'cache', label: 'Smart Cache (P8)', icon: Database },
                { id: 'benchmark', label: 'Speed Benchmark (P9)', icon: Flame },
                { id: 'telemetry', label: 'Telemetry', icon: Cpu },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      playTactileSound('click', soundEnabled);
                      setActiveTab(tab.id as typeof activeTab);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition shrink-0 whitespace-nowrap ${
                      isActive
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === 'providers' && (
              <button
                onClick={handleTestAll}
                disabled={isTestingAll}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium transition disabled:opacity-50 shrink-0 self-end sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
                {isTestingAll ? 'Pinging All...' : 'Run Connectivity Check'}
              </button>
            )}
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {/* TAB 1: PROVIDERS & HEALTH */}
            {activeTab === 'providers' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {catalog.map((p) => {
                    const health = healthMap[p.id];
                    const isPrimary = config.preferredProvider === p.id;
                    const isTesting = testingId === p.id;

                    let statusBadge = (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-medium">
                        Untested
                      </span>
                    );

                    if (health) {
                      if (health.status === 'operational') {
                        statusBadge = (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Operational ({health.latencyMs}ms)
                          </span>
                        );
                      } else if (health.status === 'scope_restricted') {
                        statusBadge = (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Scope Restricted
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-medium">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </span>
                        );
                      }
                    }

                    return (
                      <div
                        key={p.id}
                        className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                          isPrimary
                            ? 'bg-amber-500/[0.06] border-amber-500/40 shadow-lg shadow-amber-500/5'
                            : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-white">
                                  {p.displayName}
                                </span>
                                {isPrimary && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-zinc-400">
                                Default: {p.defaultModel}
                              </span>
                            </div>
                            {statusBadge}
                          </div>

                          {/* Health message */}
                          {health && (
                            <p className="mt-2.5 text-xs text-zinc-300 bg-black/40 border border-white/5 rounded-xl px-2.5 py-1.5">
                              {health.message}
                            </p>
                          )}

                          {/* Model picker & Speed Optimization */}
                          <div className="mt-3 space-y-2">
                            {p.id === 'gemini' && (
                              <div className="flex items-center justify-between pb-1">
                                <span className="text-[11px] text-amber-300/90 font-medium flex items-center gap-1">
                                  <Zap className="w-3 h-3 text-amber-400" />
                                  Smart Speed Router
                                </span>
                                <button
                                  type="button"
                                  onClick={handleToggleModelRouting}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border transition font-medium ${
                                    config.modelRouting !== 'manual'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                  }`}
                                >
                                  {config.modelRouting !== 'manual' ? '⚡ Auto-Tier Active' : 'Manual Lock'}
                                </button>
                              </div>
                            )}

                            {p.id === 'gemini' && config.modelRouting !== 'manual' ? (
                              <div className="p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 text-[11px] text-zinc-300 space-y-1">
                                <p className="text-amber-200 font-medium">⚡ Dynamic Latency Optimization</p>
                                <p className="text-[10px] text-zinc-400 leading-relaxed">
                                  Short queries & greetings $\rightarrow$ <span className="text-emerald-400 font-medium">Flash-Lite (~140ms)</span>. Synthesis $\rightarrow$ <span className="text-cyan-400 font-medium">Flash (~220ms)</span>. Math & code $\rightarrow$ <span className="text-purple-400 font-medium">Flash Reasoning (~380ms)</span>.
                                </p>
                              </div>
                            ) : (
                              <div>
                                <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                                  {p.id === 'gemini' ? 'Manual Model Override' : 'Active Model'}
                                </label>
                                <select
                                  value={config.preferredModel[p.id] || p.defaultModel}
                                  onChange={(e) => handleModelChange(p.id, e.target.value)}
                                  className="w-full text-xs bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/50"
                                >
                                  {p.supportedModels.map((m) => {
                                    const prof = geminiProfiles[m];
                                    const label = prof ? `${prof.speedBadge.split(' ')[0]} ${m} (${prof.avgLatencyMs}ms)` : m;
                                    return (
                                      <option key={m} value={m}>
                                        {label}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card actions */}
                        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                          <button
                            onClick={() => handleSetPrimary(p.id)}
                            disabled={isPrimary}
                            className={`text-xs font-medium px-2.5 py-1 rounded-lg transition ${
                              isPrimary
                                ? 'text-amber-400 bg-amber-500/10 cursor-default'
                                : 'text-zinc-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {isPrimary ? 'Current Primary' : 'Set as Primary'}
                          </button>

                          <button
                            onClick={() => handleTestProvider(p.id)}
                            disabled={isTesting}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                            {isTesting ? 'Pinging...' : 'Test Ping'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: API KEYS & VAULT */}
            {activeTab === 'keys' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-zinc-300 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white block">
                      Local Credential Hygiene
                    </span>
                    Keys are stored securely in browser local storage and dispatched directly over authorized HTTPS proxy headers. They are never logged or exposed in client bundles.
                  </div>
                </div>

                <div className="space-y-3.5">
                  {[
                    {
                      id: 'gemini' as ProviderId,
                      name: 'Google Gemini Custom API Key',
                      placeholder: 'AIzaSy...',
                      hint: 'Direct key from Google AI Studio. Recommended if container key is scope-restricted.',
                      link: 'https://aistudio.google.com/app/apikey',
                    },
                    {
                      id: 'groq' as ProviderId,
                      name: 'Groq Cloud API Key',
                      placeholder: 'gsk_...',
                      hint: 'Lightning-fast LPU inference (llama-3.3-70b). Free keys available at console.groq.com.',
                      link: 'https://console.groq.com/keys',
                    },
                    {
                      id: 'openai' as ProviderId,
                      name: 'OpenAI API Key',
                      placeholder: 'sk-proj-...',
                      hint: 'Official OpenAI GPT-4o / GPT-4o-mini keys.',
                      link: 'https://platform.openai.com/api-keys',
                    },
                    {
                      id: 'openrouter' as ProviderId,
                      name: 'OpenRouter API Key',
                      placeholder: 'sk-or-v1-...',
                      hint: 'Universal gateway supporting Claude 3.5 Sonnet, DeepSeek R1, Llama 3.3.',
                      link: 'https://openrouter.ai/keys',
                    },
                  ].map((field) => {
                    const isVisible = visibleKeys[field.id];
                    const val = config.customKeys[field.id] || '';

                    return (
                      <div
                        key={field.id}
                        className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5 text-amber-400" />
                            {field.name}
                          </label>
                          {field.link && (
                            <a
                              href={field.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline"
                            >
                              Get Key <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        <div className="relative flex items-center">
                          <input
                            type={isVisible ? 'text' : 'password'}
                            value={val}
                            placeholder={field.placeholder}
                            onChange={(e) => handleSaveKey(field.id, e.target.value)}
                            className="w-full text-xs font-mono bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 pr-10 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                          />
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(field.id)}
                            className="absolute right-3 text-zinc-400 hover:text-white"
                          >
                            {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[11px] text-zinc-400">{field.hint}</p>
                      </div>
                    );
                  })}

                  {/* Ollama endpoint */}
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-blue-400" />
                      Local Ollama Endpoint URL
                    </label>
                    <input
                      type="text"
                      value={config.customEndpoints.ollama || 'http://127.0.0.1:11434'}
                      placeholder="http://127.0.0.1:11434"
                      onChange={(e) => handleSaveEndpoint('ollama', e.target.value)}
                      className="w-full text-xs font-mono bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                    />
                    <p className="text-[11px] text-zinc-400">
                      Standard local endpoint. When Ollama is running on your system, Aetheria can route prompts 100% offline.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: FAILOVER PIPELINE */}
            {activeTab === 'pipeline' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-zinc-300">
                  <span className="font-semibold text-white block mb-1">
                    Self-Healing Cascading Sequence
                  </span>
                  When the primary provider encounters a rate limit, quota exhaustion, network timeout, or authentication error, the gateway automatically falls over to the next candidate provider in milliseconds without aborting your chat.
                </div>

                <div className="space-y-2">
                  {config.fallbackOrder.map((providerId, idx) => {
                    const provider = catalog.find((p) => p.id === providerId);
                    const isFirst = idx === 0;
                    const isLast = idx === config.fallbackOrder.length - 1;

                    return (
                      <div
                        key={providerId}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 border border-white/10"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-white/10 text-xs font-bold flex items-center justify-center text-zinc-300">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="text-xs font-semibold text-white">
                              {provider?.displayName || providerId}
                            </span>
                            <span className="text-[11px] text-zinc-400 block">
                              {providerId === 'aetheria-local'
                                ? 'Zero-latency autonomous cognitive synthesis'
                                : `Active: ${config.preferredModel[providerId] || provider?.defaultModel}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isFirst && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              PRIMARY
                            </span>
                          )}
                          {isLast && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              SAFETY NET
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 4: SMART GATEWAY CACHE (PHASE 8) */}
            {activeTab === 'cache' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-white flex items-center gap-2 text-xs">
                      <Database className="w-4 h-4 text-amber-400" />
                      Aetheria Smart Gateway Cache (In-Memory LRU)
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Deterministic SHA-256 prompt hashing delivers sub-millisecond (1ms) playback for repeated requests without consuming provider quotas.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadCacheData}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={handlePurgeCache}
                      disabled={isPurgingCache}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-300 hover:text-red-200 transition cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isPurgingCache ? 'Purging...' : 'Purge Cache'}
                    </button>
                  </div>
                </div>

                {/* Cache Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/10 space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">Hit Ratio</span>
                    <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
                      <span>{cacheStats?.hitRatio ?? 0}%</span>
                      <span className="text-[10px] font-normal text-zinc-500">efficiency</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/10 space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">Active Entries</span>
                    <div className="text-xl font-bold text-white">
                      {cacheStats?.entriesCount ?? 0}
                      <span className="text-xs font-normal text-zinc-500"> / {cacheStats?.maxEntries ?? 200}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/10 space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">Hits vs Misses</span>
                    <div className="text-base font-semibold text-zinc-200">
                      <span className="text-emerald-400">{cacheStats?.hits ?? 0}</span>
                      <span className="text-zinc-600"> / </span>
                      <span className="text-zinc-400">{cacheStats?.misses ?? 0}</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/10 space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">Memory Footprint</span>
                    <div className="text-xl font-bold text-amber-300">
                      {cacheStats?.memoryUsageKb ?? 0}
                      <span className="text-xs font-normal text-zinc-500"> KB</span>
                    </div>
                  </div>
                </div>

                {/* Cached Prompts Inspector */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-zinc-400" />
                    Recently Cached Prompts ({cacheStats?.recentEntries?.length || 0})
                  </span>

                  {(!cacheStats?.recentEntries || cacheStats.recentEntries.length === 0) ? (
                    <div className="p-6 text-center text-xs text-zinc-500 bg-white/[0.01] rounded-2xl border border-white/5">
                      No cached entries yet. Repeated prompt queries will automatically appear here with instantaneous 1ms delivery.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {cacheStats.recentEntries.map((entry) => (
                        <div
                          key={entry.hash}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-white/5 text-xs"
                        >
                          <div className="min-w-0 pr-3">
                            <p className="text-white font-medium truncate max-w-sm sm:max-w-md">
                              "{entry.promptSnippet}"
                            </p>
                            <span className="text-[10px] font-mono text-zinc-500">
                              {entry.provider} • {entry.model} • hash: {entry.hash}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {entry.hits} hits
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500">
                              {entry.ageSeconds}s ago
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: SPEED BENCHMARK & SRE INTELLIGENCE (PHASE 9) */}
            {activeTab === 'benchmark' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-zinc-900/50 to-zinc-900 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="font-semibold text-white flex items-center gap-2 text-xs">
                      <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                      Multi-Provider Speed & TTFT Benchmark Engine
                    </span>
                    <p className="text-[11px] text-zinc-300 max-w-lg">
                      Fires an identical standardized synthesis probe across all connected AI engines in parallel. Measures actual real-world Time To First Token (TTFT), overall latency, and token throughput.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunBenchmark}
                    disabled={isRunningBenchmark}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isRunningBenchmark ? 'animate-spin' : ''}`} />
                    {isRunningBenchmark ? 'Benchmarking Providers...' : '⚡ Run Speed Benchmark'}
                  </button>
                </div>

                {/* Benchmark Report Display */}
                {benchmarkReport ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>
                        Probe: <em className="text-zinc-200">"{benchmarkReport.probePrompt}"</em>
                      </span>
                      <span className="text-[10px] font-mono">
                        Fastest: <strong className="text-amber-400">{benchmarkReport.fastestProvider}</strong> ({benchmarkReport.lowestTtftMs}ms)
                      </span>
                    </div>

                    <div className="space-y-2">
                      {benchmarkReport.results.map((res, idx) => {
                        const isWinner = res.providerName === benchmarkReport.fastestProvider && res.status === 'operational';
                        return (
                          <div
                            key={res.providerId}
                            className={`p-3.5 rounded-xl border text-xs transition ${
                              isWinner
                                ? 'bg-amber-500/[0.04] border-amber-500/30'
                                : 'bg-zinc-900/60 border-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2.5">
                                {isWinner ? (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                                    🏆 1st FASTEST
                                  </span>
                                ) : (
                                  <span className="w-5 h-5 rounded-md bg-white/10 text-[11px] font-mono flex items-center justify-center text-zinc-400">
                                    {idx + 1}
                                  </span>
                                )}
                                <span className="font-semibold text-white text-xs">{res.providerName}</span>
                                <span className="text-zinc-400 font-mono text-[11px]">{res.model}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {res.status === 'operational' && (
                                  <>
                                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                                      {res.ttftMs}ms TTFT
                                    </span>
                                    <span className="text-zinc-600">·</span>
                                    <span className="text-[11px] font-mono text-zinc-300">
                                      {res.tokensPerSec} tok/s
                                    </span>
                                    <span className="text-zinc-600">·</span>
                                    <span className="text-[11px] font-mono text-zinc-400">
                                      {res.totalTimeMs}ms total
                                    </span>
                                  </>
                                )}
                                {res.status === 'unconfigured' && (
                                  <span className="text-[10px] text-zinc-500 font-mono">
                                    Key not configured
                                  </span>
                                )}
                                {res.status === 'failed' && (
                                  <span className="text-[10px] text-red-400 font-mono">
                                    Failed / Offline
                                  </span>
                                )}
                              </div>
                            </div>

                            {res.snippet && (
                              <p className="text-[11px] text-zinc-400 bg-black/30 rounded-lg p-2 font-mono line-clamp-2">
                                {res.snippet}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-zinc-500 bg-white/[0.01] rounded-2xl border border-white/5 space-y-2">
                    <Flame className="w-6 h-6 text-amber-500/40 mx-auto" />
                    <p>Click "Run Speed Benchmark" to measure real TTFT latency across all registered providers.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: TELEMETRY STREAM */}
            {activeTab === 'telemetry' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Recent Gateway Events ({telemetry.length})</span>
                  <button
                    onClick={loadTelemetryData}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {telemetry.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 bg-white/[0.01] rounded-2xl border border-white/5">
                    No gateway requests recorded in current server lifecycle yet. Send a message to inspect routing events.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {telemetry.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-xl bg-zinc-900 border border-white/10 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                t.status === 'success'
                                  ? 'bg-emerald-400'
                                  : t.status === 'fallback'
                                  ? 'bg-amber-400'
                                  : 'bg-red-400'
                              }`}
                            />
                            <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                              {t.provider}
                            </span>
                            <span className="text-zinc-400 font-mono text-[11px]">{t.model}</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(t.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span>Latency: {t.latencyMs}ms</span>
                          {t.fallbackTo && (
                            <span className="text-amber-400 font-medium">
                              Cascaded to: {t.fallbackTo}
                            </span>
                          )}
                          {t.tokensStreamed && <span>Tokens: {t.tokensStreamed}</span>}
                        </div>

                        {t.errorDetails && (
                          <p className="text-[11px] text-red-400 font-mono bg-red-500/10 rounded px-2 py-1 mt-1">
                            {t.errorDetails}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
            <div className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Aetheria AI Gateway v2.5 • Unified Multi-Provider Mesh</span>
            </div>
            <button
              onClick={() => {
                playTactileSound('click', soundEnabled);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
