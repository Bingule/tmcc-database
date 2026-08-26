# Task 3：分支独立 Dunn 拟合与转折修剪报告

## 实现范围

- 新增 `cvDunnFit.ts`，分别对 forward/reverse 支路逐电位执行标准 Dunn 回归：`i / sqrt(v)` 对 `sqrt(v)`。
- 新增 Auto/manual 转折修剪解析；Auto 严格使用批准计划中的分辨率/跨度公式，manual 将 mV 换算为 V。
- 每个支路的每个共同网格电位都保留一条记录。修剪点使用 `fit: null`、`status: "trimmed"`、`trimmed: true`，不删除、不置零。
- 数据不足与回归失败沿用项目的 nullable fit-record 模式，分别返回 `insufficientData` 和 `regressionFailed`。
- 仅扩展 `cvTypes.ts` 中 Task 3 所需类型；未接入 workflow、confidence、共享 `g(V)` 优化或 UI。

## TDD 记录

### RED

命令：

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/cv-dunn-fit.test.ts
```

失败原因：

```text
FAIL tests/cv-dunn-fit.test.ts
Failed to resolve import "../src/lib/cvDunnFit"
```

新增测试先因目标模块不存在而失败，符合 TDD 的 RED 阶段。

### GREEN 与兼容性验证

命令：

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/cv-dunn-fit.test.ts tests/regression.test.ts
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\typescript\bin\tsc' --noEmit
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/cv-cycle.test.ts tests/cv-interpolation.test.ts tests/cv-dunn-fit.test.ts tests/regression.test.ts
git diff --check
```

结果：

```text
Task 3 + regression: 2 files passed, 13 tests passed
Task 1–3 numerical compatibility: 4 files passed, 41 tests passed
tsc --noEmit: exit 0, no diagnostics
git diff --check: no whitespace errors
```

## 变更文件

- `src/lib/cvTypes.ts`
- `src/lib/cvDunnFit.ts`
- `tests/cv-dunn-fit.test.ts`

## 提交

- `ca822899 feat: fit trimmed Dunn branches`

## 疑虑

- 无未解决的功能疑虑。
- Git 对 `cvTypes.ts` 显示 LF→CRLF 提示；差异检查正常，不影响测试或类型检查。

---

## 2026-08-26 审查修复：manual trim 安全上限

### 根因

Task 3 的 manual turning-point trim 只校验了有限值和非负值。若用户输入等于或大于 common potential span 一半的 mV 值，两个转折端的 trim 区域会覆盖整个 common grid，使所有 Dunn 记录都被标记为 `trimmed`。

### RED

先在 `tests/cv-dunn-fit.test.ts` 添加回归测试：

- manual trim 为 `0 mV` 仍允许；
- manual trim 等于 common span 一半时抛出 `CvAnalysisError("invalidDataShape")`；
- manual trim 大于 common span 一半时抛出 `CvAnalysisError("invalidDataShape")`。

命令：

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/cv-dunn-fit.test.ts
```

结果：

```text
FAIL tests/cv-dunn-fit.test.ts
2 failed | 6 passed
expected [Function] to throw an error
```

失败原因符合预期：实现尚未拒绝等于/大于半跨度的 manual trim。

### GREEN 与验证

最小实现：manual trim 转为 volts 后必须满足 `2 * trim < commonSpan`，否则抛出 `CvAnalysisError("invalidDataShape")`。Auto trim 行为未修改。

命令：

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/cv-dunn-fit.test.ts
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/cv-cycle.test.ts tests/cv-interpolation.test.ts tests/cv-dunn-fit.test.ts tests/regression.test.ts
git diff --check
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\typescript\bin\tsc' --noEmit
npm run build
```

结果：

```text
tests/cv-dunn-fit.test.ts: 1 file passed, 8 tests passed
Task 1-3 numerical compatibility: 4 files passed, 44 tests passed
git diff --check: exit 0, only LF->CRLF working-copy warnings
tsc --noEmit: failed in src/lib/cvCycle.ts(395,7): 'closingRun' is possibly 'undefined'
npm run build: failed before build because npm is not available in PATH
```

### 提交

- 本次审查修复提交：见最终任务汇报中的 commit hash。

### 疑虑

- Task 3 focused tests and numerical compatibility tests pass.
- TypeScript/build verification is blocked by an existing `src/lib/cvCycle.ts` type error outside this Task 3 review-fix scope.
- `npm` is not available in this PowerShell PATH, so `npm run build` could not be used; direct bundled-node `tsc --noEmit` was run and exposed the same build-gating type error.
