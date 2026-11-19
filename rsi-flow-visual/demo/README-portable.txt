Agent Studio Windows 便携版

使用方法
1. 将整个 ZIP 解压到普通文件夹（不要直接在 ZIP 预览中运行）。
2. 双击 Start-Agent-Studio.cmd，等待浏览器打开。
3. 如浏览器未自动打开，请访问 http://127.0.0.1:1234/agent-studio.html 。
4. 在页面内填写自己的 HTTPS Base URL、模型名称和 API Key，然后运行。
5. 使用期间保持命令窗口打开；关闭窗口即停止本地服务。刷新页面不会保存 API Key。

说明
- 仅支持 Windows x64；包中已包含 Node.js，不需要另行安装。
- 服务器只监听这台电脑的 127.0.0.1；网址中的 127.0.0.1 指的是使用者自己的电脑，不是制作人的电脑。
- API Key 从浏览器传给同一台电脑上的本地服务，再由本地服务发送给所填模型提供商；不会发送到制作人的电脑。提供商可能收取费用。
- Base URL 必须是公网可达的 HTTPS OpenAI-compatible Chat Completions 服务，路径最终为 /chat/completions。部分私网或自签证书服务不受支持。
- 如提示端口 1234 已被占用，请关闭另一份 Agent Studio 或占用该端口的程序后重试。
- Windows SmartScreen 或安全软件可能提示未知来源的脚本/运行时。请只从可信来源获取压缩包，并核对文件哈希。
- 不要把填有真实 API Key 的截图、请求日志或浏览器开发者工具内容分享给他人。

运行文件：Start-Agent-Studio.cmd、launch-agent-studio.js、agent-local-server.js、agent-studio.html、node.exe。
node.exe 许可证见 NODE-LICENSE.txt。
