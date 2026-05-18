"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Key, Eye, EyeOff, Check, Cpu, ChevronDown } from "lucide-react";
import { AI_MODELS } from "@/lib/models";

const PROVIDERS = [
  { value: "openai",      label: "OpenAI",      models: AI_MODELS.openai },
  { value: "anthropic",   label: "Anthropic",   models: AI_MODELS.anthropic },
  { value: "gemini",      label: "Gemini",      models: AI_MODELS.gemini },
  { value: "openrouter",  label: "OpenRouter",  models: AI_MODELS.openrouter },
];

type Props = {
  currentProvider: string | null;
  currentModel: string | null;
  hasApiKey: boolean;
  onSave: (data: { aiProvider: string; aiApiKey?: string; aiModel: string }) => Promise<void>;
};

export function AiProviderForm({ currentProvider, currentModel, hasApiKey, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(currentProvider ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(currentModel ?? PROVIDERS[0].models[0].id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedProvider = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];

  const handleProviderChange = (value: string) => {
    setProvider(value);
    const p = PROVIDERS.find((pr) => pr.value === value);
    if (p) setModel(p.models[0].id);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({ aiProvider: provider, ...(apiKey && { aiApiKey: apiKey }), aiModel: model });
    setSaving(false);
    setSaved(true);
    setApiKey("");
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.1 }} className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-muted/30 ${open ? "border-b border-border/40" : ""}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brass-light flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-brass" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">AI Provider</h3>
            <p className="text-[11px] text-muted-foreground">Bring your own API key</p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button key={p.value} onClick={() => handleProviderChange(p.value)} className={`px-3 py-2 rounded-lg text-sm border transition-all duration-150 ${provider === p.value ? "border-primary bg-primary/5 text-foreground font-medium" : "border-border/50 text-muted-foreground hover:border-border"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            API Key{hasApiKey && !apiKey && <span className="ml-1.5 text-sage">· Configured</span>}
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasApiKey ? "Enter new key to replace" : "sk-..."} className="w-full h-10 pl-9 pr-10 rounded-lg border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all" />
            <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Model</label>
          <div className="flex flex-wrap gap-1.5">
            {selectedProvider.models.map((m) => (
              <button key={m.id} onClick={() => setModel(m.id)} className={`px-2.5 py-1 rounded-md text-xs border transition-all duration-150 ${model === m.id ? "border-primary bg-primary/5 text-foreground font-medium" : "border-border/50 text-muted-foreground hover:border-border"}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleSave} disabled={saving || (!apiKey && !hasApiKey)} className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {saved ? <><Check className="w-4 h-4" />Saved</> : saving ? "Saving..." : "Save AI Configuration"}
        </button>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
