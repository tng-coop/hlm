import React, { ReactElement, useEffect, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';

function SafeChartWrapper({ children }: { children: ReactElement }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setSize({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (size.width === 0 || size.height === 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {React.cloneElement(children as any, { width: size.width, height: size.height })}
    </div>
  );
}

interface Props {
  t: (key: string) => string;
  chartsData: {
    masteryHistory: any[];
    reviewForecast: any[];
    categoryStats: any[];
  };
}

export default function DashboardCharts({ t, chartsData }: Props) {
  const { masteryHistory, reviewForecast, categoryStats } = chartsData;

  const categoryColors = ['#06b6d4', '#ec4899', '#8b5cf6', '#10b981'];

  return (
    <div className="charts-grid top-margin fade-in" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 1. Spaced Repetition Mastery Curve over 15 Days (AreaChart) */}
      <div className="chart-card glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>{t('chart_mastery_curve') || 'Vocabulary Mastery History'}</h3>
        <div style={{ width: '100%', height: 320 }}>
          <SafeChartWrapper>
            <AreaChart data={masteryHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMastered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorLearning" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#cbd5e1" fontSize={11} tickMargin={10} minTickGap={20} />
              <YAxis stroke="#cbd5e1" fontSize={11} tickFormatter={(val) => `${val} cards`} />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <Tooltip contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area type="monotone" name="Mastered (5+ Reviews)" dataKey="Mastered" stroke="#10b981" fillOpacity={1} fill="url(#colorMastered)" strokeWidth={2} stackId="1" />
              <Area type="monotone" name="Learning" dataKey="Learning" stroke="#6366f1" fillOpacity={1} fill="url(#colorLearning)" strokeWidth={2} stackId="1" />
              <Area type="monotone" name="New" dataKey="New" stroke="#94a3b8" fillOpacity={1} fill="url(#colorNew)" strokeWidth={1} stackId="1" />
            </AreaChart>
          </SafeChartWrapper>
        </div>
      </div>

      <div className="charts-row">
        
        {/* 2. Review Forecast (BarChart) */}
        <div className="chart-card glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>{t('chart_review_forecast') || 'Review Forecast (Next 7 Days)'}</h3>
          <div style={{ width: '100%', height: 250 }}>
            <SafeChartWrapper>
              <BarChart data={reviewForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" stroke="#cbd5e1" fontSize={11} />
                <YAxis stroke="#cbd5e1" fontSize={11} tickFormatter={(val) => `${val} cards`} />
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <Tooltip contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                <Bar name="Due Cards" dataKey="Reviews" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </SafeChartWrapper>
          </div>
        </div>

        {/* 3. Category Breakdown Donut Chart */}
        <div className="chart-card glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>{t('chart_category_breakdown') || 'Category Breakdown'}</h3>
          <div style={{ width: '100%', height: 250, position: 'relative' }}>
            <SafeChartWrapper>
              <PieChart>
                <Pie data={categoryStats} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" stroke="none">
                  {categoryStats.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={categoryColors[index % categoryColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </SafeChartWrapper>
            <div style={{ position: 'absolute', top: '43%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <span style={{ display: 'block', fontSize: '2rem', fontWeight: 'bold' }}>
                {categoryStats.reduce((sum, item) => sum + item.value, 0)}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Cards</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
