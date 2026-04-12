// Chart rendering using chartjs-node-canvas
// Note: chartjs-node-canvas requires canvas native module
// Falls back to placeholder if not available

export interface TrendSeries {
  label: string;
  dataPoints: Array<{ week: string; count: number }>;
}

export async function renderTrendChart(series: TrendSeries[]): Promise<string> {
  try {
    const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
    const chartCanvas = new ChartJSNodeCanvas({ width: 800, height: 400, backgroundColour: 'white' });

    const labels = series[0]?.dataPoints.map(dp => dp.week) || [];
    const colors = ['#e63946', '#e76f51', '#f4a261', '#2a9d8f', '#4361ee'];

    const config = {
      type: 'line' as const,
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.dataPoints.map(dp => dp.count),
          borderColor: colors[i % colors.length],
          backgroundColor: colors[i % colors.length] + '20',
          fill: true,
          tension: 0.3,
        })),
      },
      options: {
        responsive: false,
        plugins: { title: { display: true, text: 'Vulnerability Trend (8 Weeks)' } },
        scales: { y: { beginAtZero: true } },
      },
    };

    const buffer = await chartCanvas.renderToBuffer(config as any);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return ''; // Chart rendering unavailable
  }
}

export async function renderSeverityPieChart(data: Record<string, number>): Promise<string> {
  try {
    const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
    const chartCanvas = new ChartJSNodeCanvas({ width: 400, height: 400, backgroundColour: 'white' });

    const config = {
      type: 'doughnut' as const,
      data: {
        labels: Object.keys(data),
        datasets: [{
          data: Object.values(data),
          backgroundColor: ['#e63946', '#e76f51', '#f4a261', '#2a9d8f'],
        }],
      },
    };

    const buffer = await chartCanvas.renderToBuffer(config as any);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}
