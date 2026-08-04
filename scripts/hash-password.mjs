import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

if (!stdin.isTTY) { console.error("请在交互式终端中运行此命令。"); process.exit(1); }
const rl = createInterface({ input: stdin, output: stdout });
let password = "";
try {
  execFileSync("stty", ["-echo"]);
  password = await rl.question("请输入新的账本登录密码：");
} finally {
  execFileSync("stty", ["echo"]);
  stdout.write("\n");
  rl.close();
}
if (password.length < 12) { console.error("密码至少需要 12 个字符。"); process.exit(1); }
const hash = await bcrypt.hash(password, 12);
console.log(`APP_PASSWORD_HASH='${hash}'`);
