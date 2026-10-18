import activity from '@/assets/monitor/icons/imgActivity.svg';
import box from '@/assets/monitor/icons/imgBox.svg';
import dashboard from '@/assets/monitor/icons/imgLayoutDashboard.svg';
import server from '@/assets/monitor/icons/imgServer.svg';
import chart from '@/assets/monitor/icons/imgChartNoAxesCombined.svg';
import globe from '@/assets/monitor/icons/imgGlobe.svg';
import mapGlobe from '@/assets/monitor/icons/imgGlobe1.svg';
import calendar from '@/assets/monitor/icons/imgCalendarDays.svg';
import refresh from '@/assets/monitor/icons/imgRefreshCw.svg';
import cpu from '@/assets/monitor/icons/imgCpu.svg';
import users from '@/assets/monitor/icons/imgUsers.svg';
import shield from '@/assets/monitor/icons/imgShieldCheck.svg';
import trend from '@/assets/monitor/icons/imgChartNoAxesCombined1.svg';
import arrow from '@/assets/monitor/icons/imgArrowUpRight.svg';
import zap from '@/assets/monitor/icons/imgZap.svg';
import info from '@/assets/monitor/icons/imgInfo.svg';
import plus from '@/assets/monitor/icons/imgPlus.svg';
import minus from '@/assets/monitor/icons/imgMinus.svg';
import circle from '@/assets/monitor/icons/imgCircleDot.svg';
import styles from './MonitorOverview.module.css';

const glyphs = {
  activity,
  box,
  dashboard,
  server,
  chart,
  globe,
  mapGlobe,
  calendar,
  refresh,
  cpu,
  users,
  shield,
  trend,
  arrow,
  zap,
  info,
  plus,
  minus,
  circle,
};

/** Bundle the design's original artwork without changing its intrinsic SVG dimensions.
 * @author ZhengLee 2026.10.18
 */
export function MonitorGlyph({ name }: { name: keyof typeof glyphs }) {
  return (
    <span className={styles.glyph} aria-hidden="true">
      <img src={glyphs[name]} alt="" />
    </span>
  );
}
