import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";

type FileEntry = { id: string; display: string };

export function useFileAutocomplete(basePath: string | null | undefined, isOpen: boolean) {
    const [files, setFiles] = useState<FileEntry[]>([]);

    useEffect(() => {
        if (isOpen && basePath && IS_TAURI) {
            invoke<string[]>("list_project_files", { root: basePath })
                .then(fileList => {
                    setFiles(fileList.map(f => ({ id: f, display: f })));
                })
                .catch(() => {});
        }
    }, [isOpen, basePath]);

    return files;
}
