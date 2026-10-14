import { createAppServer } from './app.mjs';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const server = createAppServer();
server.listen(port, host, () => {
  console.log('字启千年已启动：http://' + host + ':' + port);
  console.log(process.env.DEEPSEEK_API_KEY ? 'DeepSeek 服务已配置。' : '尚未配置 DeepSeek Key，离线学习与资料查看可用。');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
});
