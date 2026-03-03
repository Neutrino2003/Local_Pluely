import { useState } from "react";
import {
    Button,
    Header,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components";
import { useApp } from "@/contexts";
import { TYPE_PROVIDER } from "@/types";
import { Volume2, CheckIcon } from "lucide-react";

export const TtsSetup = () => {
    const {
        allTtsProviders,
        selectedTtsProvider,
        onSetSelectedTtsProvider,
    } = useApp();

    const [localVars, setLocalVars] = useState<Record<string, string>>(
        selectedTtsProvider.variables || {}
    );
    const [saved, setSaved] = useState(false);

    const selectedProvider = allTtsProviders.find(
        (p) => p.id === selectedTtsProvider.provider
    );

    // Extract variable placeholders like {{API_KEY}}, {{MODEL}}, {{VOICE}} from the curl template
    const extractVars = (curl: string): string[] => {
        const matches = curl?.matchAll(/\{\{([A-Z_]+)\}\}/g) || [];
        const vars = new Set<string>();
        for (const m of matches) {
            if (m[1] !== "TEXT") vars.add(m[1]);
        }
        return Array.from(vars);
    };

    const handleProviderChange = (providerId: string) => {
        const prov = allTtsProviders.find((p) => p.id === providerId);
        const defaults = (prov as any)?.defaultVariables || {};
        setLocalVars(defaults);
        onSetSelectedTtsProvider({
            provider: providerId,
            variables: defaults,
        });
        setSaved(false);
    };

    const handleSave = () => {
        onSetSelectedTtsProvider({
            provider: selectedTtsProvider.provider,
            variables: localVars,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const vars = selectedProvider ? extractVars(selectedProvider.curl) : [];
    const selectableProviders = allTtsProviders.filter(
        (p): p is TYPE_PROVIDER & { id: string } =>
            typeof p.id === "string" && p.id.length > 0
    );

    return (
        <div className="space-y-3">
            <Header
                title="Text-to-Speech"
                description="Configure a TTS provider to speak AI responses aloud. A 🔊 button will appear on each assistant message."
            />

            {/* Provider picker */}
            <div className="space-y-1">
                <label className="text-sm font-medium">Provider</label>
                <Select
                    value={selectedTtsProvider.provider || ""}
                    onValueChange={handleProviderChange}
                >
                    <SelectTrigger className="h-11 w-full">
                        <Volume2 className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Select a TTS provider" />
                    </SelectTrigger>
                    <SelectContent>
                        {selectableProviders.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.name || p.id}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Dynamic variable inputs */}
            {vars.length > 0 && (
                <div className="space-y-2">
                    {vars.map((varName) => (
                        <div key={varName} className="space-y-1">
                            <label className="text-sm font-medium capitalize">
                                {varName.replace(/_/g, " ").toLowerCase()}
                            </label>
                            <Input
                                type={varName === "API_KEY" ? "password" : "text"}
                                placeholder={`Enter ${varName.replace(/_/g, " ").toLowerCase()}`}
                                value={localVars[varName] || ""}
                                onChange={(e) => {
                                    const val =
                                        typeof e === "string" ? e : (e as any).target.value;
                                    setLocalVars((prev) => ({ ...prev, [varName]: val }));
                                    setSaved(false);
                                }}
                                className="h-11 border-input/50"
                            />
                        </div>
                    ))}

                    <Button
                        onClick={handleSave}
                        className="w-full h-11"
                        disabled={!selectedTtsProvider.provider}
                    >
                        {saved ? (
                            <>
                                <CheckIcon className="h-4 w-4 mr-2" /> Saved
                            </>
                        ) : (
                            "Save TTS Settings"
                        )}
                    </Button>
                </div>
            )}

            {!selectedTtsProvider.provider && (
                <p className="text-xs text-muted-foreground">
                    Select a provider above to configure TTS. You can leave this empty if
                    you don&apos;t want AI responses read aloud.
                </p>
            )}
        </div>
    );
};
