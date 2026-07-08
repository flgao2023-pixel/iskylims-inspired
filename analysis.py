#!/usr/bin/env python3
import argparse
import csv
import json
import os
from collections import Counter
HAVE_MPL = True
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except Exception:
    HAVE_MPL = False


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()

    inp = args.input
    outdir = args.out
    os.makedirs(outdir, exist_ok=True)

    samples = []
    with open(inp, newline='') as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            samples.append(r)

    # Count per superpopulation, population, and gender
    sp = [s.get('superpopulation') or s.get('super_pop') or '' for s in samples]
    pop = [s.get('population') or s.get('pop') or '' for s in samples]
    gender = [s.get('gender') or '' for s in samples]

    counts_sp = Counter(sp)
    counts_pop = Counter(pop)
    counts_gender = Counter(gender)

    # Prepare summary
    summary = {
        'total_samples': len(samples),
        'by_superpopulation': dict(counts_sp),
        'by_population': dict(counts_pop),
        'by_gender': dict(counts_gender)
    }
    with open(os.path.join(outdir, 'summary.json'), 'w') as fh:
        json.dump(summary, fh, indent=2)

    # Plot categories if matplotlib is available
    if HAVE_MPL:
        fig, axes = plt.subplots(3, 1, figsize=(10, 12))

        items = sorted(counts_sp.items(), key=lambda x: -x[1])
        labels = [i[0] or 'NA' for i in items]
        values = [i[1] for i in items]
        axes[0].bar(labels, values, color='#2563eb')
        axes[0].set_title('Samples per Superpopulation')
        axes[0].tick_params(axis='x', rotation=45)

        items = sorted(counts_gender.items(), key=lambda x: -x[1])
        labels = [i[0] or 'NA' for i in items]
        values = [i[1] for i in items]
        axes[1].bar(labels, values, color='#10b981')
        axes[1].set_title('Samples by Gender')

        items = sorted(counts_pop.items(), key=lambda x: -x[1])[:10]
        labels = [i[0] or 'NA' for i in items]
        values = [i[1] for i in items]
        axes[2].bar(labels, values, color='#ef4444')
        axes[2].set_title('Top 10 Populations')
        axes[2].tick_params(axis='x', rotation=45)

        plt.tight_layout()
        plot_path = os.path.join(outdir, 'plot.png')
        fig.savefig(plot_path)
        plt.close(fig)

        # Also save individual plots for compatibility
        for idx, (title, color, counts) in enumerate([
            ('Samples per Superpopulation', '#2563eb', counts_sp),
            ('Samples by Gender', '#10b981', counts_gender),
            ('Top 10 Populations', '#ef4444', Counter(dict(sorted(counts_pop.items(), key=lambda x: -x[1])[:10])))
        ]):
            fig = plt.figure(figsize=(10, 4))
            items = sorted(counts.items(), key=lambda x: -x[1])
            labels = [i[0] or 'NA' for i in items]
            values = [i[1] for i in items]
            plt.bar(labels, values, color=color)
            plt.title(title)
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout()
            outimg = os.path.join(outdir, f'plot_{idx+1}.png')
            fig.savefig(outimg)
            plt.close(fig)

        print('Wrote', plot_path)
    else:
        print('matplotlib not available; summary only written to summary.json')


if __name__ == '__main__':
    main()
