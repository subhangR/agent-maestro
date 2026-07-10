import type { Dispatch, SetStateAction } from "react";
import type { AgentTool, LaunchAccessMode, LaunchConfig, LaunchReasoningEffort, LaunchSpeed } from "../../app/types/maestro";
import { AgentLogo } from "./AgentChip";
import {
    ACCESS_MODE_OPTIONS,
    AGENT_TOOL_OPTIONS,
    createLaunchConfig,
    formatLaunchConfigLabel,
    getReasoningOptionsForProvider,
    sanitizeLaunchConfig,
    SPEED_OPTIONS,
    supportsLaunchSpeed,
} from "../../app/constants/agentTools";

type LaunchConfigDropdownProps = {
    launchConfig: LaunchConfig | null;
    activeTool: AgentTool | null;
    onActiveToolChange: Dispatch<SetStateAction<AgentTool | null>>;
    onLaunchConfigChange: Dispatch<SetStateAction<LaunchConfig | null>>;
    onClear?: () => void;
    showAdvancedOptions?: boolean;
};

const DEFAULT_TOOL: AgentTool = "claude-code";

export function LaunchConfigDropdown({
    launchConfig,
    activeTool,
    onActiveToolChange,
    onLaunchConfigChange,
    onClear,
    showAdvancedOptions = true,
}: LaunchConfigDropdownProps) {
    const selectedTool = AGENT_TOOL_OPTIONS.find((tool) => tool.id === activeTool)
        || AGENT_TOOL_OPTIONS.find((tool) => tool.provider === launchConfig?.provider)
        || AGENT_TOOL_OPTIONS.find((tool) => tool.id === DEFAULT_TOOL)
        || AGENT_TOOL_OPTIONS[0];

    const currentModel = launchConfig?.provider === selectedTool.provider
        ? launchConfig.model
        : selectedTool.models[0]?.id;
    const modelForCapability = String(currentModel || selectedTool.models[0]?.id || "");
    const reasoningOptions = getReasoningOptionsForProvider(selectedTool.provider, modelForCapability);
    const speedSupported = supportsLaunchSpeed(selectedTool.provider, modelForCapability);

    const updateProviderOption = (patch: Partial<Pick<LaunchConfig, "reasoningEffort" | "speed" | "accessMode">>) => {
        onLaunchConfigChange((current) => {
            const base = current?.provider === selectedTool.provider
                ? current
                : createLaunchConfig(selectedTool.id, selectedTool.models[0]?.id || "sonnet");
            return sanitizeLaunchConfig({ ...base, ...patch }) || base;
        });
    };

    const selectModel = (model: string) => {
        onLaunchConfigChange((current) => {
            const base = createLaunchConfig(
                selectedTool.id,
                model,
                current?.provider === selectedTool.provider ? current : undefined,
            );
            return sanitizeLaunchConfig(base) || base;
        });
    };

    const renderModelButton = (model: { id: string; label: string }) => {
        const selected = launchConfig?.provider === selectedTool.provider && launchConfig.model === model.id;
        return (
            <button
                type="button"
                key={model.id}
                className={`terminalLaunchDropdown__model ${selected ? "terminalLaunchDropdown__model--selected" : ""}`}
                onClick={() => selectModel(model.id)}
            >
                <span>{model.label}</span>
                {selected && <span className="terminalStatusCheck">✓</span>}
            </button>
        );
    };

    return (
        <div className="terminalLaunchDropdown__layout">
            <div className="terminalLaunchDropdown__providers">
                <div className="terminalLaunchDropdown__header">Launch With</div>
                {AGENT_TOOL_OPTIONS.map((tool) => {
                    const selected = selectedTool.id === tool.id;
                    const configured = launchConfig?.provider === tool.provider;
                    return (
                        <button
                            type="button"
                            key={tool.id}
                            className={`terminalLaunchDropdown__tool ${selected ? "terminalLaunchDropdown__tool--expanded" : ""}`}
                            onClick={() => {
                                onActiveToolChange(tool.id);
                                // Commit a provisional config for the newly selected provider so
                                // switching panels (without clicking a model) doesn't leave the
                                // launchConfig pointing at the previous provider.
                                if (launchConfig?.provider !== tool.provider) {
                                    const base = createLaunchConfig(tool.id, tool.models[0]?.id || "sonnet");
                                    onLaunchConfigChange(sanitizeLaunchConfig(base) || base);
                                }
                            }}
                        >
                            <AgentLogo agentTool={tool.id} size={12} className="terminalLaunchDropdown__toolSymbol" />

                            <span className="terminalLaunchDropdown__toolLabel">{tool.label}</span>
                            {configured && <span className="terminalLaunchDropdown__toolMeta">{formatLaunchConfigLabel(launchConfig)}</span>}
                            <span className="terminalLaunchDropdown__toolCaret">›</span>
                        </button>
                    );
                })}
                {onClear && launchConfig && (
                    <button type="button" className="terminalLaunchDropdown__clear" onClick={onClear}>
                        Clear override
                    </button>
                )}
            </div>

            <div className="terminalLaunchDropdown__details">
                <div className="terminalLaunchDropdown__detailsHeader">
                    <span className="terminalLaunchDropdown__detailsTitle">{selectedTool.label}</span>
                    <span className="terminalLaunchDropdown__detailsMeta">
                        {launchConfig?.provider === selectedTool.provider ? formatLaunchConfigLabel(launchConfig) : "Default"}
                    </span>
                </div>

                <div className="terminalLaunchDropdown__section">
                    <div className="terminalLaunchDropdown__sectionTitle">Model</div>
                    <div className="terminalLaunchDropdown__optionGrid">
                        {selectedTool.models.map(renderModelButton)}
                    </div>
                </div>

                {showAdvancedOptions && reasoningOptions.length > 0 && (
                    <div className="terminalLaunchDropdown__section">
                        <div className="terminalLaunchDropdown__sectionTitle">Intelligence</div>
                        <div className="terminalLaunchDropdown__optionGrid terminalLaunchDropdown__optionGrid--compact">
                            {reasoningOptions.map((option) => {
                                const selected = launchConfig?.provider === selectedTool.provider && launchConfig.reasoningEffort === option.value;
                                return (
                                    <button
                                        type="button"
                                        key={option.value}
                                        className={`terminalLaunchDropdown__model ${selected ? "terminalLaunchDropdown__model--selected" : ""}`}
                                        onClick={() => updateProviderOption({ reasoningEffort: option.value as LaunchReasoningEffort })}
                                    >
                                        <span>{option.label}</span>
                                        {selected && <span className="terminalStatusCheck">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {showAdvancedOptions && (
                    <div className="terminalLaunchDropdown__section">
                        <div className="terminalLaunchDropdown__sectionTitle">Access</div>
                        <div className="terminalLaunchDropdown__optionGrid">
                            {ACCESS_MODE_OPTIONS.map((option) => {
                                const selected = launchConfig?.provider === selectedTool.provider && (launchConfig.accessMode || "safe") === option.value;
                                return (
                                    <button
                                        type="button"
                                        key={option.value}
                                        className={`terminalLaunchDropdown__model terminalLaunchDropdown__model--withDescription ${selected ? "terminalLaunchDropdown__model--selected" : ""}`}
                                        onClick={() => updateProviderOption({ accessMode: option.value as LaunchAccessMode })}
                                        title={option.description}
                                    >
                                        <span>
                                            <span className="terminalLaunchDropdown__modelLabel">{option.label}</span>
                                            <span className="terminalLaunchDropdown__modelDescription">{option.description}</span>
                                        </span>
                                        {selected && <span className="terminalStatusCheck">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {showAdvancedOptions && speedSupported && (
                    <div className="terminalLaunchDropdown__section">
                        <div className="terminalLaunchDropdown__sectionTitle">Speed</div>
                        <div className="terminalLaunchDropdown__optionGrid">
                            {SPEED_OPTIONS.map((option) => {
                                const selected = launchConfig?.provider === selectedTool.provider && (launchConfig.speed || "standard") === option.value;
                                return (
                                    <button
                                        type="button"
                                        key={option.value}
                                        className={`terminalLaunchDropdown__model terminalLaunchDropdown__model--withDescription ${selected ? "terminalLaunchDropdown__model--selected" : ""}`}
                                        onClick={() => updateProviderOption({ speed: option.value as LaunchSpeed })}
                                    >
                                        <span>
                                            <span className="terminalLaunchDropdown__modelLabel">{option.label}</span>
                                            <span className="terminalLaunchDropdown__modelDescription">{option.description}</span>
                                        </span>
                                        {selected && <span className="terminalStatusCheck">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
