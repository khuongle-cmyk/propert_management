const fs = require("fs");
const path = require("path");

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) files.push(p);
  }
  return files;
}

const root = path.join(__dirname, "..", "src");
for (const f of walk(root)) {
  const c = fs.readFileSync(f, "utf8");
  const n = c.replace(/\.from\(\s*['"]leads['"]\s*\)/g, '.from("customer_companies")');
  if (n !== c) {
    fs.writeFileSync(f, n);
    console.log("updated", path.relative(root, f));
  }
}
