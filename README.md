# 脊髄損傷 歩行予後予測アプリ

外傷性脊髄損傷者の受傷後15日以内の神経学的評価から、1年後の屋内歩行自立確率を推定する静的Webアプリです。

## 使い方

`index.html` をブラウザで開きます。GitHub Pagesでは、このフォルダの内容を公開リポジトリに置くだけで動作します。

## 主な機能

- 症例ID、担当者名、受傷からの日数、ISNCSCI NLI、ASIA impairment scale、年齢、L3/S1 Motor score、L3/S1 Light touch scoreの入力
- 左右のうち良い方のスコアを自動採用
- Prediction score、ロジット、歩行自立確率を自動計算
- 低確率、中等度、高確率に応じた色分け
- 歩行再建への提案コメントを確率帯に応じて自動表示
- 予測曲線グラフ
- 複数症例の端末保存
- 症例一覧と症例別グラフ（最大10例表示、NLI表示）
- ブラウザの印刷機能によるPDF保存
- JSON形式のバックアップと復元

## 計算式

```text
Prediction score =
-10 x Age65
+ 2 x L3 Motor
+ 2 x S1 Motor
+ 5 x L3 Light touch
+ 5 x S1 Light touch
```

```text
P = exp(-3.273 + 0.267 x score) / (1 + exp(-3.273 + 0.267 x score))
```

## 出典

van Middendorp JJ, Hosman AJF, Donders ART, et al. A clinical prediction rule for ambulation outcomes after traumatic spinal cord injury: a longitudinal cohort study. Lancet. 2011;377:1004-1010.

DOI: https://doi.org/10.1016/S0140-6736(10)62276-3

## 注意

本ツールは臨床判断を置き換えるものではありません。予測対象は1年後の屋内歩行自立であり、屋外歩行能力、歩行速度、歩行の質を直接予測するものではありません。
