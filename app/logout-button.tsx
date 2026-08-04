"use client";
export function LogoutButton(){return <button className="auth-logout" title="退出登录" aria-label="退出登录" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});window.location.assign("/login");}}>退</button>;}
