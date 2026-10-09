import React, { useMemo } from 'react';
import { KpiCard, ChartFrame, StatusDonut } from '../dashboard/widgets';
import CountBars from './CountBars';
import { monthlyCounts, pctOf } from './chartData';
import '../dashboard/widgets.css';
import './pageCharts.css';

// Customer status split and sign-ups per month. `customers` follows the table's current filters.
const CustomersCharts = ({ customers }) => {
  const stats = useMemo(() => {
    const by = (s) => customers.filter((c) => (c.status || 'potential') === s).length;
    return {
      potential: by('potential'),
      successful: by('successful'),
      unsuccessful: by('unsuccessful'),
      converted: customers.filter((c) => c.source === 'lead_conversion').length,
      monthly: monthlyCounts(customers, 'created_at'),
    };
  }, [customers]);

  if (!customers.length) {
    return (
      <div className="pc-row">
        <ChartFrame title="Customer overview" subtitle="Status split and new customers per month">
          <p className="wg-empty">No customers to chart yet. Add a customer to see insights here.</p>
        </ChartFrame>
      </div>
    );
  }

  const total = customers.length;
  const segments = [
    { label: 'Potential', color: 'var(--pending)', count: stats.potential },
    { label: 'Successful', color: 'var(--paid)', count: stats.successful },
    { label: 'Unsuccessful', color: 'var(--overdue)', count: stats.unsuccessful },
  ];
  const thisMonth = stats.monthly.values[stats.monthly.values.length - 1];

  return (
    <div className="pc-row">
      <div className="wg-grid-kpi">
        <KpiCard label="Customers" value={total} note="Matching the current filters" />
        <KpiCard label="Successful" value={stats.successful} note={`${pctOf(stats.successful, total).toFixed(0)}% of customers`} />
        <KpiCard label="Converted leads" value={stats.converted} note={`${pctOf(stats.converted, total).toFixed(0)}% came from leads`} />
        <KpiCard label="New this month" value={thisMonth} note="Customers added this month" />
      </div>
      <div className="wg-grid-donut">
        <ChartFrame
          title="Customers by status"
          subtitle="Potential, successful and unsuccessful"
          legend={segments.map((s) => ({ label: s.label, color: s.color, value: s.count }))}
        >
          <StatusDonut segments={segments} centerLabel="customers" />
        </ChartFrame>
        <ChartFrame title="New customers per month" subtitle="Customers added in the last 7 months">
          <CountBars labels={stats.monthly.labels} values={stats.monthly.values} noun="customers" />
        </ChartFrame>
      </div>
    </div>
  );
};

export default CustomersCharts;
