import React, { ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { Contribution, Member } from './types';

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
  members: Member[];
  contributions: Contribution[];
  t: (key: string) => string;
}

export default function DashboardCharts({ members, contributions, t }: Props) {
  // Aggregate data for Capital Growth and Monthly Volume
  const monthlyData = useMemo(() => {
    const months: Record<string, { name: string; newCapital: number; totalCapital: number }> = {};
    const today = new Date();
    // Initialize exactly past 24 months to 0
    for (let i = 23; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { name: key, newCapital: 0, totalCapital: 0 };
    }

    // Add new capital
    contributions.forEach(c => {
      const d = new Date(c.pay_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (months[key]) {
        months[key].newCapital += Number(c.amount);
      }
    });

    // Calculate cumulative
    let runningTotal = 0;
    const sortedKeys = Object.keys(months).sort();
    sortedKeys.forEach(k => {
      runningTotal += months[k].newCapital;
      months[k].totalCapital = runningTotal;
    });

    return sortedKeys.map(k => months[k]);
  }, [contributions]);

  // Aggregate data for Pie Chart
  const memberStatusData = useMemo(() => {
    let active = 0, inactive = 0, deceased = 0;
    members.forEach(m => {
      if (!m.is_living) deceased++;
      else if (m.status === 'inactive') inactive++;
      else active++;
    });

    return [
      { name: t('status_active') || 'Active', value: active, color: '#10b981' }, // Green
      { name: t('status_inactive') || 'Inactive', value: inactive, color: '#fbbf24' }, // Yellow
      { name: t('status_deceased') || 'Deceased', value: deceased, color: '#ef4444' } // Red
    ].filter(d => d.value > 0);
  }, [members, t]);

  // Custom localized tooltip formatter
  const formatYen = (val: number | string) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(Number(val));

  return (
    <div className="charts-grid top-margin fade-in" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 1. Cumulative Capital Growth (AreaChart) */}
      <div className="chart-card glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>{t('chart_cumulative_capital') || 'Cumulative Capital Growth'}</h3>
        <div style={{ width: '100%', height: 320 }}>
          <SafeChartWrapper>
            <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#cbd5e1" fontSize={12} tickMargin={10} minTickGap={20} />
              <YAxis stroke="#cbd5e1" fontSize={12} tickFormatter={(val) => `¥${(val/1000).toLocaleString()}k`} />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <Tooltip formatter={(value) => [formatYen(value), t('stat_total_capital') || 'Total Capital']} contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }} />
              <Area type="monotone" dataKey="totalCapital" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTotal)" strokeWidth={3} />
            </AreaChart>
          </SafeChartWrapper>
        </div>
      </div>

      <div className="charts-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        
        {/* 2. Monthly Volume (BarChart) */}
        <div className="chart-card glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>{t('chart_monthly_volume') || 'Monthly Capital Volume'}</h3>
          <div style={{ width: '100%', height: 250 }}>
            <SafeChartWrapper>
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#cbd5e1" fontSize={12} minTickGap={20} />
                <YAxis stroke="#cbd5e1" fontSize={12} tickFormatter={(val) => `¥${(val/1000).toLocaleString()}k`} />
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <Tooltip formatter={(value) => [formatYen(value), t('chart_monthly_volume') || 'New Capital']} contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }} cursor={{fill: 'rgba(255,255,255,0.1)'}} />
                <Bar dataKey="newCapital" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </SafeChartWrapper>
          </div>
        </div>

        {/* 3. Member Status (DonutChart) */}
        <div className="chart-card glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>{t('chart_member_status') || 'Member Breakdown'}</h3>
          <div style={{ width: '100%', height: 250, position: 'relative' }}>
            <SafeChartWrapper>
              <PieChart>
                <Pie data={memberStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                  {memberStatusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </SafeChartWrapper>
            <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <span style={{ display: 'block', fontSize: '2rem', fontWeight: 'bold' }}>{members.length}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
