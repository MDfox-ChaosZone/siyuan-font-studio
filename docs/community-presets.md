# 社区字体方案投稿与发布

社区目录独立于插件版本。插件每次打开“下载字体方案”时读取 `community-catalog` 分支中的 `catalog.json`；读取失败时显示本次会话缓存和内置方案。方案文件存放在本仓库的 GitHub Release。

## 投稿者

1. 在插件里保存并导出方案。可以导出包含字体的 ZIP，或仅包含设置的 JSON。
2. 如果字体不允许重新分发，请提交 JSON，并在介绍中注明所需字体及获取方式。
3. 点击插件下载页中的“分享我的方案”，填写 GitHub Issue 模板：方案名称、简介、效果截图、字体来源与授权、方案文件。名称必须与导出文件中的名称完全一致。
4. GitHub Issue 附件超过大小限制时，先将文件上传到自己的 GitHub Release，再把文件链接填入表单。最终发布时文件会复制到本项目的 Release。
5. 关注 Issue 下的自动检查结果；未通过时编辑 Issue 并重新上传文件。

## 维护者首次设置

1. 将 `.github/ISSUE_TEMPLATE/share-font-preset.yml` 和两条工作流合入默认分支，并在仓库中启用 GitHub Actions。
2. 在仓库中创建 `publish-approved` 标签。只有具有仓库管理权限的维护者应使用它。
3. 确认 Actions 工作流可使用 `GITHUB_TOKEN` 的 `contents: write` 和 `issues: write` 权限。工作流已显式声明权限；仓库或组织的更严格策略可能仍需调整。
4. 第一次发布时，工作流会从默认分支创建 `community-catalog` 分支并写入 `catalog.json`。此分支中的目录由工作流维护。

## 审核与发布

投稿 Issue 创建或编辑时，`validate-font-preset.yml` 自动下载文件、检查预设结构、字体清单、文件大小和哈希，并在 Issue 回复结果。审核者还须手工检查实际显示效果、截图内容及每款字体的再分发许可；自动检查不能判断许可证是否真实或适用。

审核通过后，维护者添加 `publish-approved` 标签。`publish-font-preset.yml` 将重新下载并校验文件，创建专属 Release，将带哈希的条目加入目录，然后回复并关闭 Issue。若审核后 Issue 正文被修改，发布会中止；请移除并重新添加审核标签。发布中途失败时，可通过 Actions 中的 `workflow_dispatch` 输入 Issue 编号重试，已有 Release 资产会复用。

目录条目包含名称、作者、简介、预览图、字体配置摘要、文件大小、SHA-256、是否包含字体以及 Issue 链接。插件只接受本项目 Release 的 HTTPS 下载地址，下载后仍会执行大小和 SHA-256 校验。`catalog.json` 位于 GitHub 原始文件服务上，打开下载页时会附加时间参数请求最新版本；远程不可用时继续显示内置方案。

## 管理已发布内容

若方案需要撤下，应先从 `community-catalog` 分支的 `catalog.json` 删除对应条目，再删除相关 Release。已经下载或导入的副本无法远程删除。若需要发布新版方案，请让投稿者创建新 Issue；旧方案可按上述方式下架。
