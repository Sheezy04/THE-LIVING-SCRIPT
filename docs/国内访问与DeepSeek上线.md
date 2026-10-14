# 国内访问与 DeepSeek 问答上线

域名是访问地址，实际可用性还取决于承载网页和问答的服务。当前 Cloudflare Worker 同时提供网页与 `/api/ask`；GitHub Pages 只提供网页。项目已经带有 Node／Docker 后端，无需把密钥写进浏览器。

## 面向国内长期使用的建议

采用“国内注册的域名＋中国大陆云托管或服务器＋HTTPS”。购买前先确认域名及云资源满足所选云厂商的备案要求。将网页和问答一起部署到现有 Node 服务，让国内访客直接访问这个服务，由服务端调用 DeepSeek。

1. 在阿里云或腾讯云注册域名，完成实名认证；选择大陆云托管或支持 Node／Docker 的云资源，并按接入商流程办理 ICP 备案。
2. 上传部署包。云托管平台设置 `HOST=0.0.0.0`、平台要求的 `PORT`、`DEEPSEEK_API_KEY`，启动命令为 `npm start`；也可使用包内 Dockerfile。Key 作为服务端环境变量或 Secret 保存。
3. 将域名解析或绑定到该服务，配置 HTTPS，并把 `PUBLIC_ORIGIN` 设置为实际访问地址，例如 `https://你的域名`。网页和 `/api/health`、`/api/ask` 使用同一个域名。
4. 检查 `/api/health` 显示 `available:true`，在手机流量下实际提问，再分别测试移动、联通、电信线路。首页和看板能打开不代表问答链路一定畅通，必须同时验证。

如果采用服务器＋反向代理，应将 Node 端口放在代理后面；限流与代理设置见《公网部署与 AI 问答》。大陆部署可以直接调用官方 DeepSeek API，不需要再经过 Cloudflare Worker。

## 保留 Cloudflare 的过渡方案

购买域名后，将域名接入 Cloudflare，进入 Workers & Pages → `the-living-script` → Settings → Domains & Routes → Add → Custom Domain。域名接入状态正常、证书生效后，整站与 AI 问答即可使用同一新地址。

自定义域名不会自动获得中国大陆加速，能否改善访问需要实测。Cloudflare China Network 是 Enterprise 计划下的额外服务，并要求 ICP 及内容审核，不适合作为本项目的默认低成本方案。

## 官方参考

- [阿里云备案前准备](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/overview/)
- [ICP备案与服务器地域](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check)
- [Cloudflare Worker 自定义域名](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare China Network 前置条件](https://developers.cloudflare.com/china-network/get-started/)
