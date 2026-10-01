# Feasibility — block composition → power-curve change

GoldenCheetah OpenData: 6552 athletes downloaded, 1373 eligible (≥200 rides over ≥540 days), 173694 four-week blocks.

R² = share of within-athlete variance in power change explained on **held-out athletes**.
"Gain" = what block composition adds beyond controls (fitness, testing, season, level).

| Duration | Blocks | Athletes | R² controls | R² + block | Gain |
|---|---|---|---|---|---|
| 5s | 145082 | 1372 | 0.231 | 0.239 | **+0.007** |
| 1m | 157755 | 1372 | 0.386 | 0.403 | **+0.017** |
| 5m | 162646 | 1372 | 0.405 | 0.430 | **+0.025** |
| 20m | 162950 | 1372 | 0.405 | 0.432 | **+0.027** |

## Effects (within-athlete, per +1 SD of the feature, % change in best power)
CI = 95 % athlete bootstrap. Bold = CI excludes 0.

### 5s

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+1.65** | [+0.99, +2.22] |
| z67_h_wk | **+0.69** | [+0.46, +0.92] |
| monotony | **-0.55** | [-0.89, -0.35] |
| rest_days | **-0.49** | [-0.84, -0.28] |
| hard_days | **-0.45** | [-0.66, -0.22] |
| ramp | **+0.43** | [+0.37, +0.51] |
| hours_wk | -0.40 | [-1.01, +0.04] |
| z4_h_wk | **-0.40** | [-0.71, -0.12] |
| z12_h_wk | +0.27 | [-0.07, +0.60] |
| z5_h_wk | -0.18 | [-0.43, +0.07] |
| z3_h_wk | -0.15 | [-0.35, +0.08] |
| recovery_wk | -0.01 | [-0.13, +0.09] |

### 1m

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+2.87** | [+2.34, +3.39] |
| hours_wk | **-1.03** | [-1.65, -0.47] |
| z67_h_wk | **+0.74** | [+0.46, +1.00] |
| hard_days | **-0.53** | [-0.69, -0.36] |
| z12_h_wk | **+0.52** | [+0.19, +0.91] |
| z4_h_wk | **-0.49** | [-0.71, -0.23] |
| ramp | **+0.45** | [+0.39, +0.51] |
| monotony | **-0.43** | [-0.61, -0.22] |
| rest_days | **-0.39** | [-0.63, -0.14] |
| z3_h_wk | **-0.27** | [-0.51, -0.03] |
| z5_h_wk | -0.21 | [-0.47, +0.04] |
| recovery_wk | -0.05 | [-0.13, +0.03] |

### 5m

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+2.13** | [+1.60, +2.56] |
| hours_wk | **-0.77** | [-1.38, -0.09] |
| rest_days | **-0.69** | [-0.89, -0.50] |
| ramp | **+0.54** | [+0.49, +0.58] |
| hard_days | **-0.36** | [-0.46, -0.25] |
| monotony | **-0.32** | [-0.46, -0.12] |
| z12_h_wk | +0.23 | [-0.09, +0.63] |
| z5_h_wk | +0.15 | [-0.03, +0.33] |
| recovery_wk | **-0.10** | [-0.17, -0.05] |
| z4_h_wk | -0.10 | [-0.26, +0.05] |
| z67_h_wk | +0.02 | [-0.18, +0.22] |
| z3_h_wk | +0.01 | [-0.14, +0.17] |

### 20m

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+1.91** | [+1.37, +2.36] |
| hours_wk | **-1.03** | [-1.61, -0.49] |
| rest_days | **-1.01** | [-1.26, -0.81] |
| ramp | **+0.58** | [+0.54, +0.63] |
| hard_days | **-0.32** | [-0.45, -0.20] |
| monotony | **-0.26** | [-0.45, -0.08] |
| z4_h_wk | **+0.26** | [+0.13, +0.39] |
| z67_h_wk | **-0.26** | [-0.49, -0.04] |
| z12_h_wk | +0.22 | [-0.12, +0.60] |
| z5_h_wk | **+0.19** | [+0.02, +0.35] |
| z3_h_wk | +0.15 | [-0.01, +0.29] |
| recovery_wk | **-0.09** | [-0.17, -0.02] |
