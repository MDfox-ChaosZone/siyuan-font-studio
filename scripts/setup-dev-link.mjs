import {existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(projectRoot, "plugin.json"), "utf8"));
const workspaceArg = process.argv.slice(2).find((argument) => argument !== "--") || process.env.SIYUAN_WORKSPACE;

if (!workspaceArg) {
    console.error([
        "缺少思源工作空间路径。",
        "",
        "用法：pnpm dev:setup -- \"D:\\\\SiYuanWorkspace\"",
        "或先设置环境变量 SIYUAN_WORKSPACE。"
    ].join("\n"));
    process.exit(1);
}

const workspace = resolve(workspaceArg);
const dataDir = join(workspace, "data");
const pluginsDir = join(dataDir, "plugins");
const pluginDir = join(pluginsDir, manifest.name);

if (!existsSync(dataDir)) {
    console.error(`这不像思源工作空间（找不到 ${dataDir}）。`);
    process.exit(1);
}

mkdirSync(pluginsDir, {recursive: true});

if (existsSync(pluginDir)) {
    const stat = lstatSync(pluginDir);
    if (stat.isSymbolicLink()) {
        const currentTarget = resolve(dirname(pluginDir), readlinkSync(pluginDir));
        if (currentTarget === projectRoot) {
            console.log(`开发链接已经就绪：${pluginDir} -> ${projectRoot}`);
            process.exit(0);
        }
    }

    console.error([
        `插件目录已存在：${pluginDir}`,
        "为防止覆盖已安装插件，脚本没有修改它。",
        "请先关闭思源并将该目录重命名或移走，然后重新运行此命令。"
    ].join("\n"));
    process.exit(1);
}

symlinkSync(projectRoot, pluginDir, process.platform === "win32" ? "junction" : "dir");

console.log([
    `开发链接创建成功：${pluginDir} -> ${projectRoot}`,
    "",
    "接下来运行：pnpm dev",
    "修改源码后 webpack 会自动编译；在思源中重新加载插件或按 Ctrl+R 查看效果。"
].join("\n"));
