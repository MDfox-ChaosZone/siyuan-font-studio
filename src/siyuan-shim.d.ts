declare module "siyuan" {
    export class Plugin {
        readonly name: string;
        i18n: Record<string, string>;
        setting: Setting;
        openSetting(): void;
        onload(): void | Promise<void>;
        onLayoutReady(): void;
        onunload(): void;
        uninstall(): void;
        addIcons(svg: string): void;
        addCommand(command: {langKey: string; hotkey: string; callback: () => void}): void;
        addTopBar(options: {icon: string; title: string; position?: "south" | "left" | "right"; callback: (event: MouseEvent) => void}): HTMLElement;
        loadData(storageName: string): Promise<unknown>;
        saveData(storageName: string, data: unknown): Promise<unknown>;
        removeData(storageName: string): Promise<unknown>;
    }

    export class Dialog {
        element: HTMLElement;
        constructor(options: {title: string; content: string; width?: string; height?: string; destroyCallback?: () => void});
        destroy(): void;
    }

    export class Setting {
        constructor(options: {width?: string; height?: string; destroyCallback?: () => void; confirmCallback?: () => void});
        addItem(options: {title: string; description?: string; actionElement?: HTMLElement; direction?: "column" | "row"}): void;
    }

    export class Menu {
        constructor(id?: string, closeCB?: () => void);
        addItem(option: {label?: string; icon?: string; current?: boolean; type?: "separator" | "submenu" | "readonly" | "empty"; click?: (element: HTMLElement, event: MouseEvent) => void | Promise<void>}): HTMLElement;
        addSeparator(): HTMLElement;
        open(options: {x: number; y: number; w?: number; h?: number; isLeft?: boolean}): void;
        close(): void;
    }

    export function showMessage(message: string, timeout?: number, type?: "info" | "error"): void;
    export function confirm(title: string, text: string, callback: () => void): void;
    export function getAllModels(): {graph: unknown[]; [key: string]: unknown};
}

declare global {
    interface Window {
        siyuan: {
            config?: {
                editor: {
                    fontSize: number;
                    [key: string]: unknown;
                };
                system: {
                    workspaceDir: string;
                    [key: string]: unknown;
                };
            };
        };
        require?: (module: string) => {ipcRenderer?: {send: (channel: string, payload: unknown) => void}};
    }
}

export {};
