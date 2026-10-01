# Feasibility — block composition → power-curve change

GoldenCheetah OpenData: 5443 athletes downloaded, 1111 eligible (≥200 rides over ≥540 days), 140225 four-week blocks.

R² = share of within-athlete variance in power change explained on **held-out athletes**.
"Gain" = what block composition adds beyond controls (fitness, testing, season, level).

| Duration | Blocks | Athletes | R² controls | R² + block | Gain |
|---|---|---|---|---|---|
| 5s | 116663 | 1110 | 0.233 | 0.239 | **+0.006** |
| 1m | 127053 | 1110 | 0.389 | 0.406 | **+0.016** |
| 5m | 131110 | 1110 | 0.410 | 0.434 | **+0.025** |
| 20m | 131303 | 1110 | 0.409 | 0.436 | **+0.027** |

## Effects (within-athlete, per +1 SD of the feature, % change in best power)
CI = 95 % athlete bootstrap. Bold = CI excludes 0.

### 5s

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+1.42** | [+0.53, +2.08] |
| z67_h_wk | **+0.70** | [+0.43, +1.01] |
| monotony | **-0.49** | [-0.82, -0.24] |
| ramp | **+0.41** | [+0.32, +0.49] |
| hard_days | **-0.40** | [-0.63, -0.13] |
| rest_days | **-0.40** | [-0.71, -0.10] |
| z4_h_wk | **-0.35** | [-0.69, -0.03] |
| hours_wk | -0.30 | [-1.16, +0.46] |
| z12_h_wk | +0.26 | [-0.20, +0.75] |
| z5_h_wk | -0.16 | [-0.48, +0.20] |
| z3_h_wk | -0.09 | [-0.29, +0.22] |
| recovery_wk | -0.02 | [-0.16, +0.08] |

### 1m

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+2.72** | [+2.07, +3.39] |
| z67_h_wk | **+0.74** | [+0.40, +1.00] |
| hours_wk | **-0.72** | [-1.48, -0.14] |
| hard_days | **-0.53** | [-0.70, -0.29] |
| ramp | **+0.46** | [+0.39, +0.51] |
| z4_h_wk | **-0.39** | [-0.63, -0.13] |
| monotony | **-0.39** | [-0.56, -0.18] |
| z12_h_wk | **+0.36** | [+0.03, +0.69] |
| rest_days | **-0.35** | [-0.62, -0.08] |
| z3_h_wk | **-0.34** | [-0.55, -0.12] |
| z5_h_wk | -0.22 | [-0.45, +0.06] |
| recovery_wk | -0.02 | [-0.11, +0.07] |

### 5m

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+2.05** | [+1.55, +2.78] |
| hours_wk | **-0.76** | [-1.53, -0.20] |
| rest_days | **-0.66** | [-0.84, -0.43] |
| ramp | **+0.53** | [+0.47, +0.59] |
| hard_days | **-0.35** | [-0.50, -0.21] |
| monotony | **-0.25** | [-0.40, -0.08] |
| z12_h_wk | +0.23 | [-0.07, +0.68] |
| z5_h_wk | +0.14 | [-0.04, +0.30] |
| recovery_wk | **-0.10** | [-0.16, -0.03] |
| z67_h_wk | +0.03 | [-0.26, +0.20] |
| z3_h_wk | +0.01 | [-0.17, +0.24] |
| z4_h_wk | +0.00 | [-0.16, +0.20] |

### 20m

| Feature | Effect % | 95 % CI |
|---|---|---|
| tss_wk | **+1.86** | [+1.23, +2.63] |
| rest_days | **-1.02** | [-1.24, -0.76] |
| hours_wk | **-0.99** | [-1.80, -0.47] |
| ramp | **+0.57** | [+0.52, +0.63] |
| hard_days | **-0.32** | [-0.47, -0.17] |
| z4_h_wk | **+0.29** | [+0.17, +0.47] |
| monotony | **-0.25** | [-0.41, -0.08] |
| z67_h_wk | **-0.21** | [-0.51, -0.00] |
| z12_h_wk | +0.20 | [-0.09, +0.58] |
| z5_h_wk | +0.17 | [-0.05, +0.34] |
| z3_h_wk | +0.16 | [-0.03, +0.35] |
| recovery_wk | -0.06 | [-0.14, +0.01] |
