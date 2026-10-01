# Responder profiles

Does a rider-specific response to block composition, learned on the **first half** of their history, predict the **second half** better than the population model?

Response features: `tss_wk`, `hours_wk`, `z4_h_wk`, `z5_h_wk`, `z67_h_wk`, `rest_days`, `ramp`, `monotony`. Athletes need ≥80 blocks; 70-day gap between halves.

## Personal profiles (own δ)

| Duration | Athletes | Test blocks | R² population | R² + personal | Gain | λ |
|---|---|---|---|---|---|---|
| 5s | 759 | 56024 | 0.1679 | 0.1696 | **+0.0017** | 1000 |
| 1m | 870 | 64702 | 0.3112 | 0.3163 | **+0.0051** | 1000 |
| 5m | 900 | 67770 | 0.3098 | 0.3159 | **+0.0061** | 1000 |
| 20m | 907 | 68162 | 0.3129 | 0.3272 | **+0.0143** | 300 |

## Stability of δ (corr. first-half vs second-half estimate, per feature)

| Feature | 5s | 1m | 5m | 20m |
|---|---|---|---|---|
| tss_wk | +0.09 | +0.16 | +0.21 | +0.26 |
| hours_wk | +0.16 | +0.22 | +0.38 | +0.36 |
| z4_h_wk | +0.08 | +0.15 | +0.14 | +0.22 |
| z5_h_wk | +0.12 | +0.20 | +0.18 | +0.22 |
| z67_h_wk | +0.19 | +0.27 | +0.22 | +0.29 |
| rest_days | +0.08 | +0.11 | +0.14 | +0.14 |
| ramp | +0.04 | +0.05 | +0.07 | +0.12 |
| monotony | +0.07 | +0.17 | +0.13 | +0.17 |

## Types (KMeans on δ)

| k | R² 5s | R² 1m | R² 5m | R² 20m |
|---|---|---|---|---|
| 2 | 0.1679 | 0.3120 | 0.3126 | 0.3189 |
| 3 | 0.1679 | 0.3125 | 0.3140 | 0.3207 |
| 4 | 0.1677 | 0.3128 | 0.3148 | 0.3240 |
| 5 | 0.1679 | 0.3127 | 0.3145 | 0.3238 |
| 6 | 0.1675 | 0.3123 | 0.3139 | 0.3228 |

Best k = 4. Signatures = centroid deviation from population, % change in best power per +1 SD of the feature:

| Type | Athletes | Signature (top 4) |
|---|---|---|
| 0 | 360 | 20m:rest_days +0.1%, 20m:monotony -0.1%, 5s:z67_h_wk +0.1%, 20m:z5_h_wk +0.1% |
| 1 | 232 | 20m:rest_days -0.2%, 20m:monotony +0.2%, 20m:hours_wk +0.2%, 20m:tss_wk +0.1% |
| 2 | 299 | 20m:tss_wk -0.2%, 20m:hours_wk -0.2%, 20m:z4_h_wk -0.1%, 20m:z5_h_wk -0.1% |
| 3 | 27 | 20m:z67_h_wk +0.7%, 20m:tss_wk +0.6%, 20m:rest_days -0.6%, 20m:hours_wk +0.5% |

## Cold start

Type predicted from training habits only (athlete means of block features): accuracy **46.3%** vs majority baseline 39.2%.

## History length: population vs type vs own vs hybrid

Only the last H weeks before the split are used to learn the rider; R² on the later half. Type centroids come from other riders only. Gain vs population ×1000.

### 5s

| History | Population R² | Type | Own | Hybrid |
|---|---|---|---|---|
| 13 wk | 0.1679 | -0.0 | **+0.7** | +0.5 |
| 26 wk | 0.1679 | +0.2 | **+2.4** | +2.3 |
| 52 wk | 0.1679 | -0.6 | **+2.1** | +1.0 |
| 78 wk | 0.1679 | -0.1 | **+2.3** | +1.7 |
| all | 0.1679 | -0.6 | **+1.7** | +0.8 |

### 1m

| History | Population R² | Type | Own | Hybrid |
|---|---|---|---|---|
| 13 wk | 0.3112 | +0.6 | +4.4 | **+4.7** |
| 26 wk | 0.3112 | +1.0 | +4.9 | **+5.3** |
| 52 wk | 0.3112 | +0.8 | **+4.5** | +4.2 |
| 78 wk | 0.3112 | +0.7 | **+4.8** | +4.4 |
| all | 0.3112 | +1.2 | +5.1 | **+5.3** |

### 5m

| History | Population R² | Type | Own | Hybrid |
|---|---|---|---|---|
| 13 wk | 0.3098 | +1.5 | +4.1 | **+5.0** |
| 26 wk | 0.3098 | +2.2 | +4.5 | **+5.5** |
| 52 wk | 0.3098 | +3.7 | +4.4 | **+5.9** |
| 78 wk | 0.3098 | +3.9 | +5.1 | **+6.4** |
| all | 0.3098 | +4.2 | +6.1 | **+7.5** |

### 20m

| History | Population R² | Type | Own | Hybrid |
|---|---|---|---|---|
| 13 wk | 0.3129 | +3.2 | **+7.0** | +4.2 |
| 26 wk | 0.3129 | +3.6 | **+6.6** | +2.4 |
| 52 wk | 0.3129 | +7.8 | **+12.0** | +10.7 |
| 78 wk | 0.3129 | +8.3 | **+13.0** | +11.2 |
| all | 0.3129 | +9.7 | **+14.3** | +13.2 |
