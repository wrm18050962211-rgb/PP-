import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appID = "7YH7CGR8C7.com.frameyu.still";

const read = (relativePath) => readFile(join(websiteDir, relativePath), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(content, expected, file) {
  assert(content.includes(expected), `${file} 缺少：${expected}`);
}

const homepage = await read("index.html");
assertIncludes(homepage, "<title>Still帧遇｜线下摄影与陪拍服务</title>", "index.html");
assert(/<h1[^>]*>Still帧遇<\/h1>/.test(homepage), "index.html 的主标题必须是 Still帧遇");

for (const phrase of ["线下摄影与陪拍服务", "需求沟通", "摄影师报价", "订单确认", "定金支付", "售后处理"]) {
  assertIncludes(homepage, phrase, "index.html");
}

const legalFiles = ["privacy.html", "terms.html", "refund.html", "account-deletion.html"];
for (const file of legalFiles) {
  const content = await read(file);
  assertIncludes(content, "Still帧遇", file);
  assertIncludes(content, 'name="robots" content="noindex,nofollow"', file);
  assertIncludes(content, "上线前草案", file);
  assertIncludes(content, "生效日期：待正式发布时确定", file);
}

const appPage = await read("app/index.html");
assert(/<h1[^>]*>Still帧遇<\/h1>/.test(appPage), "app/index.html 的主标题必须是 Still帧遇");
assertIncludes(appPage, "线下摄影与陪拍服务", "app/index.html");

const aasa = JSON.parse(await read(".well-known/apple-app-site-association"));
const details = aasa.applinks?.details;
assert(Array.isArray(details), "AASA applinks.details 必须是数组");
const appDetails = details.find((item) => item.appIDs?.includes(appID));
assert(appDetails, `AASA 缺少 appID：${appID}`);
const paths = new Set(appDetails.components?.map((component) => component["/"]));
assert(paths.has("/app/"), "AASA 缺少 /app/ 精确路径");
assert(paths.has("/app/*"), "AASA 缺少 /app/* 子路径");

const headers = await read("_headers");
assertIncludes(headers, "/.well-known/apple-app-site-association", "_headers");
assertIncludes(headers, "Content-Type: application/json", "_headers");

const htmlFiles = (await readdir(websiteDir, { recursive: true }))
  .filter((file) => file.endsWith(".html"));
for (const file of htmlFiles) {
  const content = await read(file);
  assert(!content.includes("Still by InFrame"), `${file} 仍包含旧品牌 Still by InFrame`);
}

console.log("Website review readiness checks passed.");
