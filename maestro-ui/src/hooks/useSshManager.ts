import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import { SshHostEntry, SshForward, buildSshCommand } from "../app/utils/ssh";
import { formatError } from "../utils/formatters";
import { copyToClipboard } from "../utils/domUtils";
import { makeId } from "../app/utils/id";

interface UseSshManagerProps {
  showNotice: (message: string, timeoutMs?: number) => void;
}

export function useSshManager({ showNotice }: UseSshManagerProps) {
  const [sshManagerOpen, setSshManagerOpen] = useState(false);
  const [sshHosts, setSshHosts] = useState<SshHostEntry[]>([]);
  const [sshHostsLoading, setSshHostsLoading] = useState(false);
  const [sshHostsError, setSshHostsError] = useState<string | null>(null);
  const [sshHost, setSshHost] = useState("");
  const sshHostInputRef = useRef<HTMLInputElement>(null);
  const [sshPersistent, setSshPersistent] = useState(true);
  const [sshForwardOnly, setSshForwardOnly] = useState(false);
  const [sshExitOnForwardFailure, setSshExitOnForwardFailure] = useState(true);
  const [sshForwards, setSshForwards] = useState<SshForward[]>([]);
  const [sshError, setSshError] = useState<string | null>(null);

  const refreshSshHosts = useCallback(async () => {
    if (!IS_TAURI) {
      setSshHosts([]);
      setSshHostsLoading(false);
      setSshHostsError(null);
      return;
    }
    setSshHostsLoading(true);
    setSshHostsError(null);
    try {
      const list = await invoke<SshHostEntry[]>("list_ssh_hosts");
      setSshHosts(list);
    } catch (err) {
      setSshHostsError(formatError(err));
    } finally {
      setSshHostsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sshManagerOpen) return;
    setSshError(null);
    void refreshSshHosts();
    window.setTimeout(() => {
      sshHostInputRef.current?.focus();
    }, 0);
  }, [sshManagerOpen, refreshSshHosts]);

  const sshCommandPreview = useMemo(() => {
    return buildSshCommand({
      host: sshHost,
      forwards: sshForwards,
      exitOnForwardFailure: sshExitOnForwardFailure,
      forwardOnly: sshForwardOnly,
    });
  }, [sshHost, sshForwards, sshExitOnForwardFailure, sshForwardOnly]);

  const copySshCommand = useCallback(async () => {
    if (!sshCommandPreview) return;
    const ok = await copyToClipboard(sshCommandPreview);
    showNotice(ok ? "Copied SSH command" : "Could not copy SSH command");
  }, [sshCommandPreview, showNotice]);

  const addSshForward = useCallback(() => {
    setSshForwards((prev) => [
      ...prev,
      {
        id: makeId(),
        type: "local",
        bindAddress: "",
        listenPort: "",
        destinationHost: "localhost",
        destinationPort: "",
      },
    ]);
  }, []);

  const removeSshForward = useCallback((id: string) => {
    setSshForwards((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateSshForward = useCallback((id: string, patch: Partial<SshForward>) => {
    setSshForwards((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  return {
    sshManagerOpen,
    setSshManagerOpen,
    sshHosts,
    setSshHosts,
    sshHostsLoading,
    sshHostsError,
    sshHost,
    setSshHost,
    sshHostInputRef,
    sshPersistent,
    setSshPersistent,
    sshForwardOnly,
    setSshForwardOnly,
    sshExitOnForwardFailure,
    setSshExitOnForwardFailure,
    sshForwards,
    setSshForwards,
    addSshForward,
    removeSshForward,
    updateSshForward,
    sshError,
    setSshError,
    refreshSshHosts,
    sshCommandPreview,
    copySshCommand,
  };
}
