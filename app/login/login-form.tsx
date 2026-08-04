"use client";
import { FormEvent, useState } from "react";

function returnTarget() { const value=new URLSearchParams(window.location.search).get("returnTo"); return value&&value.startsWith("/")&&!value.startsWith("//")?value:"/"; }
export function LoginForm(){
  const[username,setUsername]=useState(""),[password,setPassword]=useState(""),[remember,setRemember]=useState(true),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setError("");setLoading(true);try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password,remember})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"登录失败，请稍后重试");window.location.assign(returnTarget());}catch(reason){setError(reason instanceof Error?reason.message:"登录失败，请稍后重试");setLoading(false);}}
  return <form className="login-form" onSubmit={submit}>
    <label><span>用户名</span><input autoComplete="username" autoFocus required value={username} onChange={event=>setUsername(event.target.value)} placeholder="请输入用户名"/></label>
    <label><span>密码</span><input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} placeholder="请输入密码"/></label>
    <label className="remember"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/><span>在此设备保持登录 30 天</span></label>
    {error&&<p className="login-error" role="alert">{error}</p>}
    <button type="submit" disabled={loading}>{loading?"正在登录…":"登录"}</button>
  </form>;
}
