// 프리셋 선택 화면에 보여줄 설명을 터미널에 출력한다: npm run presets [-- <id>]
import { PRESETS, describePreset } from '../src/index.js';

const only = process.argv[2] ? Number(process.argv[2]) : null;
for (const p of PRESETS) {
  if (only !== null && p.id !== only) continue;
  const d = describePreset(p.id);
  console.log(`\n[${d.id}] ${d.name}`);
  for (const s of d.summary) console.log(`  · ${s}`);
  if (d.comparedTo) {
    console.log(`  ${d.comparedTo}와 다른 점:`);
    for (const s of d.differences) console.log(`    - ${s}`);
  }
}
