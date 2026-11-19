"use client";

import { useState } from "react";
import { Key, Eye, EyeOff, Cpu } from "lucide-react";
import { AI_MODELS } from "@/lib/models";
import { SettingsCard, SaveButton } from "@/components/settings/settings-card";
import { optionClass } from "@/components/ui/bottom-sheet";
import { useToast } from "@/components/ui/toast";

const PROVIDERS = [
  { value: "openai",      label: "OpenAI",      models: AI_MODELS.openai },
  { value: "anthropic",   label: "Anthropic",   models: AI_MODELS.anthropic },
  { value: "gemini",      label: "Gemini",      models: AI_MODELS.gemini },
  { value: "openrouter",  label: "OpenRouter",  models: AI_MODELS.openrouter },
];

const inputClass =
  "w-full h-12 rounded-xl border border-input bg-background/70 text-base text-foreground placeholder:text-faint focus:outline-none focus:border-hour/70 transition-colors";

type Props = {
  currentProvider: string | null;
  currentModel: string | null;
  hasApiKey: boolean;
  onSave: (data: { aiProvider: string; aiApiKey?: string; aiModel: string }) => Promise<void>;
};

export function AiProviderForm({ currentProvider, currentModel, hasApiKey, onSave }: Props) {
  const [provider, setProvider] = useState(currentProvider ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(currentModel ?? PROVIDERS[0].models[0].id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedProvider = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];

  /**
   * A saved model the picker doesn't list means the user typed it, so the form reopens in
   * custom mode with it filled in. Without this, revisiting Settings would silently show one
   * of the presets as selected while a different model was actually in use.
   */
  const [custom, setCustom] = useState(
    () => !!currentModel && !PROVIDERS.some((p) => p.models.some((m) => m.id === currentModel))
  );

  const handleProviderChange = (value: string) => {
    setProvider(value);
    const p = PROVIDERS.find((pr) => pr.value === value);
    if (p) {
      setModel(p.models[0].id);
      setCustom(false);
    }
  };

  const { notify } = useToast();
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ aiProvider: provider, ...(apiKey && { aiApiKey: apiKey }), aiModel: model.trim() });
    } catch {
      notify("Couldn't save your AI settings — please try again.");
      return;
    } finally {
      setSaving(false);
    }
    setSaved(true);
    setApiKey("");
    setTimeout(() => setSaved(false), 2000);
  };

  const currentLabel = PROVIDERS.find((p) => p.value === currentProvider)?.label;
  const summary = hasApiKey && currentLabel ? `${currentLabel} · ${currentModel ?? "default model"}` : "Using the shared trial key";

  return (
    <SettingsCard icon={Cpu} title="AI provider" value={summary}>
      <div role="group" aria-label="Provider">
        <span className="text-[13px] font-medium text-muted-foreground block mb-2">Provider</span>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button key={p.value} type="button" aria-pressed={provider === p.value} onClick={() => handleProviderChange(p.value)} className={optionClass(provider === p.value)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-[13px] font-medium text-muted-foreground block mb-2">
          API key{hasApiKey && !apiKey && <span className="ml-1.5 text-done">· saved</span>}
        </span>
        <span className="relative block">
          <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? "Enter a new key to replace it" : "sk-…"}
            autoComplete="off"
            className={`${inputClass} pl-11 pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            aria-label={showKey ? "Hide key" : "Show key"}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted-foreground"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </span>
      </label>
      <div role="group" aria-label="Model">
        <span className="text-[13px] font-medium text-muted-foreground block mb-2">Model</span>
        <div className="flex flex-wrap gap-2">
          {selectedProvider.models.map((m) => (
            <button key={m.id} type="button" aria-pressed={!custom && model === m.id} onClick={() => { setModel(m.id); setCustom(false); }} className={`${optionClass(!custom && model === m.id)} px-3.5`}>
              {m.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={custom}
            onClick={() => { setCustom(true); setModel(""); }}
            className={`${optionClass(custom)} px-3.5`}
          >
            Custom…
          </button>
        </div>
        {custom && (
          <>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={selectedProvider.models[0].id}
              autoComplete="off"
              spellCheck={false}
              aria-label="Custom model id"
              className={`${inputClass} mt-3 px-4`}
            />
            <p className="mt-2 text-[13px] text-muted-foreground">
              Exactly as the provider spells it — e.g. {selectedProvider.models[0].id}
            </p>
          </>
        )}
      </div>
      <SaveButton
        onClick={handleSave}
        saving={saving}
        saved={saved}
        disabled={!model.trim() || (!apiKey && !hasApiKey)}
        label="Save AI settings"
      />
    </SettingsCard>
  );
}
