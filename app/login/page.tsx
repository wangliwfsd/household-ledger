import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title">
    <div className="login-brand"><span>衡</span><div><strong>家衡</strong><small>家庭资产账本</small></div></div>
    <div className="login-copy"><p>欢迎回来</p><h1 id="login-title">登录你的家庭账本</h1><span>数据保存在你的私人服务器中</span></div>
    <LoginForm />
    <footer><i aria-hidden="true">●</i> 私有部署 · 安全会话</footer>
  </section></main>;
}
