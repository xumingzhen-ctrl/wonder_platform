import React, { useState, useEffect, useRef } from 'react';
import BrokerSync from './components/BrokerSync';
import BrokerImport from './components/BrokerImport';
import WealthReport from './components/WealthReport';
import Sidebar from './components/Sidebar';
import StrategyLabView from './components/StrategyLabView';
import PortfolioView from './components/PortfolioView';
import CreatePortfolioModal from './components/modals/CreatePortfolioModal';
import DividendModal from './components/modals/DividendModal';
import DeleteModal from './components/modals/DeleteModal';
import RenameModal from './components/modals/RenameModal';
import RebalanceModal from './components/modals/RebalanceModal';
import ManageDivModal from './components/modals/ManageDivModal';
import CompositionModal from './components/modals/CompositionModal';
import McDocModal from './components/modals/McDocModal';
import ClientInfoModal from './components/ClientInfoModal';
import { authStorage, authHeaders } from './utils/auth';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import AdvisorClientsPanel from './components/AdvisorClientsPanel';
import FeatureLock from './components/FeatureLock';


// ── 角色颜色/标签映射（全局复用）──
const ROLE_META = {
  admin:   { label: '管理员', color: '#ef4444' },
  advisor: { label: '财务顾问', color: '#3b82f6' },
  premium: { label: '付费会员', color: '#f59e0b' },
  free:    { label: '普通用户', color: '#6b7280' },
};

function App() {
  const [portfolios, setPortfolios] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeTab, setActiveTab] = useState('portfolios'); // 'portfolios' or 'lab'
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDivModal, setShowDivModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [rebalancePreview, setRebalancePreview] = useState(null);
  const [rebalanceDate, setRebalanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeSubTab, setActiveSubTab] = useState('performance'); // 'performance' or 'dividends'
  const [divProjData, setDivProjData] = useState(null);
  const [divLoading, setDivLoading] = useState(false);
  const [taxRate, setTaxRate] = useState(0.0);
  const [dripMode, setDripMode] = useState(false);
  const [showBrokerSync, setShowBrokerSync] = useState(false);
  const [showBrokerImport, setShowBrokerImport] = useState(false);

  // Manage Dividends State
  const [showManageDivModal, setShowManageDivModal] = useState(false);
  const [dividendHistory, setDividendHistory] = useState([]);

  // Portfolio Composition Management State
  const [showCompModal, setShowCompModal] = useState(false);
  const [compTxs, setCompTxs] = useState([]);
  const [compTargets, setCompTargets] = useState({});
  const [compEditing, setCompEditing] = useState({});
  const [compNewAsset, setCompNewAsset] = useState({ isin: '', weight: 0, shares: 0, price: 0 });

  // Strategy Lab State
  const [labIsins, setLabIsins] = useState(['VOO', 'QQQ', 'IE0033534557']);
  const [labInput, setLabInput] = useState('');
  const [labData, setLabData] = useState(null);
  const [labLoading, setLabLoading] = useState(false);
  const [labError, setLabError] = useState(null);
  const [labDaysBack, setLabDaysBack] = useState(1825);
  const [labMaxWeight, setLabMaxWeight] = useState(1.0);
  const [labMode, setLabMode] = useState('custom'); // 'auto' or 'custom'
  const [labCustomWeights, setLabCustomWeights] = useState({});
  const [insuranceEnabled, setInsuranceEnabled] = useState(false);
  const [insurancePlan, setInsurancePlan] = useState(null);
  const [insuranceAlphaLow, setInsuranceAlphaLow] = useState(0.80);
  const [insuranceAlphaHigh, setInsuranceAlphaHigh] = useState(1.20);
  const [labMcSettings, setLabMcSettings] = useState({
    capital: 1000000,
    contribution: 0,
    contribution_start: 1,
    contribution_years: 10,
    withdrawal: 0,
    withdrawal_start: 1,
    withdrawal_end: 30,
    withdrawal_inflation: false,
    years: 30,
    target: 2000000,
    stress: false,
    inflation: 2.5
  });
  const [labTab, setLabTab] = useState('optimization'); // optimization, backtest
  const [showLabDebug, setShowLabDebug] = useState(false);
  const [labChartFontSize, setLabChartFontSize] = useState(14);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [clientInfoModalOpen, setClientInfoModalOpen] = useState(false);
  const [clientInfo, setClientInfo] = useState(null);
  const [showMcDoc, setShowMcDoc] = useState(false);
  // Saved Scenarios State
  const [scenariosDrawer, setScenariosDrawer] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioSaving, setScenarioSaving] = useState(false);

  // ── Undo Confirm Dialog State ────────────────────────────────────────────
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);

  // ── Auth State ──────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => authStorage.getUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setAuthModalOpen(false);
    // Token is now in localStorage — re-fetch portfolios so admin/advisor sees all
    setTimeout(() => fetchPortfolios(), 100);
  };

  const handleLogout = () => {
    authStorage.clear();
    setCurrentUser(null);
    // Re-fetch without token to show only public portfolios
    setTimeout(() => fetchPortfolios(), 100);
  };
  

  const [newPf, setNewPf] = useState({
    name: '',
    budget: 1000000,
    date: new Date().toISOString().split('T')[0],
    dividend_strategy: 'CASH',
    base_currency: 'USD',
    allocations: [{ isin: '', weight: 0.5, manual_price: '' }, { isin: '', weight: 0.5, manual_price: '' }]
  });

  // Manual Dividend Form State
  const [mDiv, setMDiv] = useState({ isin: '', date: new Date().toISOString().split('T')[0], amount: 0 });

  const totalWeight = newPf.allocations.reduce((sum, a) => sum + parseFloat(a.weight || 0), 0);
  
  // Real-time lab sum for validation
  const labSum = labMode === 'custom' 
    ? labIsins.reduce((acc, isin) => acc + (parseFloat(labCustomWeights[isin]) || 0), 0)
    : 100;
  const isLabReady = labIsins.length >= 2 && Math.abs(labSum - 100) < 0.1;

  useEffect(() => {
    fetchPortfolios();
  }, []);

  // Process data for Ghostfolio Asset Allocation Widgets
  const sectorData = React.useMemo(() => {
    try {
      if (!data || !data.details) return [];
      let map = {};
      data.details.forEach(d => {
        if (d.isin.startsWith('CASH_')) return; // Skip cash for sector breakdown
        if (typeof d.sector === 'object' && !Array.isArray(d.sector) && d.sector !== null) {
          Object.entries(d.sector).forEach(([k, weight]) => {
            const name = String(k).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); // Format "consumer_cyclical" -> "Consumer Cyclical"
            map[name] = (map[name] || 0) + (Number(d.market_value) || 0) * (Number(weight) || 0);
          });
        } else {
          const s = String(d.sector || 'Unknown');
          map[s] = (map[s] || 0) + (Number(d.market_value) || 0);
        }
      });
      return Object.entries(map)
        .map(([name, value]) => ({ name, value, pct: data.total_nav > 0 ? (value / data.total_nav * 100) : 0 }))
        .filter(d => d.value > 0 && !isNaN(d.value) && isFinite(d.value));
    } catch (e) {
      console.error("Safeguard: Sector processing failed", e);
      return [];
    }
  }, [data]);

  const top10Data = React.useMemo(() => {
    try {
      if (!data || !data.details) return [];
      return data.details
        .filter(d => !d.isin.startsWith('CASH_') && Number(d.market_value) > 0)
        .sort((a, b) => Number(b.market_value) - Number(a.market_value))
        .slice(0, 10)
        .map(d => ({
          name: d.name && d.name.length > 20 ? d.name.substring(0, 18) + '…' : (d.name || d.isin),
          fullName: d.name || d.isin,
          isin: d.isin,
          value: Number(d.market_value),
          pct: data.total_nav > 0 ? (Number(d.market_value) / data.total_nav * 100) : 0
        }));
    } catch (e) {
      console.error("Safeguard: Top10 processing failed", e);
      return [];
    }
  }, [data]);

  const fetchPortfolios = () => {
    fetch('/api/portfolios', { headers: authHeaders() })
      .then(res => res.json())
      .then(list => {
        setPortfolios(list);
        setActiveId(currentId => {
          if (!currentId && list.length > 0) return list[0].id;
          // If the current active ID is no longer in the list, fallback to first
          if (currentId && !list.find(p => p.id === currentId)) {
            return list.length > 0 ? list[0].id : null;
          }
          if (list.length === 0) return null;
          return currentId;
        });
      })
      .catch(err => console.error("Fetch portfolios error:", err));
  };

  useEffect(() => {
    if (activeId) {
      setLoading(true);
      setHistoryData([]); // Clear old history
      
      // 1. Fetch Core Data
      fetch(`/api/report/${activeId}`)
        .then(res => res.json())
        .then(resData => {
          if (resData.detail) throw new Error(resData.detail);
          setData(resData);
        })
        .catch(err => {
          console.error("Fetch report error:", err);
          setData(null);
        })
        .finally(() => setLoading(false));

      // 2. Fetch Historical Time-Series (Async background)
      fetch(`/api/report/history/${activeId}`)
        .then(async res => {
          const text = await res.text();
          // Python's json.dumps emits actual `NaN` which breaks strict JSON.parse. Handle it cleanly.
          const cleanText = text.replace(/:\s*NaN/g, ': null'); 
          return JSON.parse(cleanText);
        })
        .then(hData => {
            if (Array.isArray(hData)) {
                // Filter out any null or NaN values that could crash Recharts SVG renderers
                const cleanData = hData.filter(d => d && d.date && d.value !== null && !isNaN(d.value));
                setHistoryData(cleanData);
            }
        })
        .catch(err => console.error("History fetch error:", err));

      } else {
      setData(null);
      setHistoryData([]);
      setDivProjData(null);
    }
  }, [activeId]);

  // ── Heartbeat: Smart 10s poll — only full reload if NAV changed ─────────────
  const lastNavRef = useRef(null);
  useEffect(() => {
    if (!activeId) return;
    
    const pollHeartbeat = async () => {
      try {
        const res = await fetch(`/api/heartbeat/${activeId}`);
        if (!res.ok) return;
        const hb = await res.json();
        
        if (!hb.cache_hit || hb.total_nav === 0) return; // No cached data yet
        
        const prevNav = lastNavRef.current;
        const currNav = hb.total_nav;

        // Compute staleness (>5 min since last_updated)
        const isStale = hb.last_updated
          ? (Date.now() - new Date(hb.last_updated).getTime()) > 5 * 60 * 1000
          : false;

        // Trigger full reload if NAV moved more than 0.1% or data is stale
        const navChanged = prevNav !== null && Math.abs(currNav - prevNav) / Math.max(prevNav, 1) > 0.001;

        if (navChanged || isStale) {
          lastNavRef.current = currNav;
          // Re-trigger main report fetch silently (no loading spinner)
          fetch(`/api/report/${activeId}`)
            .then(r => r.json())
            .then(d => { if (!d.detail) setData(d); })
            .catch(() => {});
        } else if (prevNav === null) {
          lastNavRef.current = currNav;
        }
      } catch (_) {}
    };

    const interval = setInterval(pollHeartbeat, 10_000);
    return () => clearInterval(interval);
  }, [activeId]);

  useEffect(() => {
    if (activeId && activeSubTab === 'dividends') {
       setDivLoading(true);
       fetch(`/api/portfolios/dividends/projections/${activeId}?tax_rate=${taxRate}&drip=${dripMode}`)
         .then(res => {
           if (!res.ok) throw new Error(`Server returned ${res.status}`);
           return res.json();
         })
         .then(d => {
           if (d && d.portfolio_metrics) {
             setDivProjData(d);
           } else {
             setDivProjData(null);
           }
           setDivLoading(false);
         })
         .catch(err => {
           console.error("Div projection fetch error:", err);
           setDivProjData(null);
           setDivLoading(false);
         });
    }
  }, [activeId, activeSubTab, taxRate, dripMode]);

  const getDaysUntil = (dateStr) => {
    if (!dateStr) return null;
    const diffTime = new Date(dateStr) - new Date();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleCreatePortfolio = async (e) => {
    e.preventDefault();
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      alert("Total weight must be 100% (1.0)");
      return;
    }

    const allocationsObj = {};
    const manualPrices = {};
    newPf.allocations.forEach(a => {
      allocationsObj[a.isin] = parseFloat(a.weight);
      if (a.manual_price) manualPrices[a.isin] = parseFloat(a.manual_price);
    });

    const res = await fetch('/api/portfolios/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newPf.name,
        budget: parseFloat(newPf.budget),
        date: newPf.date,
        dividend_strategy: newPf.dividend_strategy,
        base_currency: newPf.base_currency || 'USD',
        allocations: allocationsObj,
        manual_prices: manualPrices
      })
    });

    if (res.ok) {
      const result = await res.json();
      setShowModal(false);
      fetchPortfolios();
      setActiveId(result.portfolio_id);
    }
  };


  const handleDelete = async () => {
    if (!deleteCandidate) return;
    await fetch(`/api/portfolios/${deleteCandidate}`, { method: 'DELETE' });
    setShowDeleteModal(false);
    // Don't set activeId to null here. fetchPortfolios will automatically detect 
    // that the currentId is missing from the new list and fallback to the first available.
    setDeleteCandidate(null);
    fetchPortfolios(); // This will auto-select the first available if activeId is now null or invalid
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!renameDraft.trim()) return;
    await fetch(`/api/portfolios/${activeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameDraft.trim() })
    });
    setShowRenameModal(false);
    fetchPortfolios();
  };

  const handleUndoRebalance = () => {
    if (!activeId) return;
    setUndoConfirmOpen(true);
  };

  const handleUndoConfirmed = async () => {
    setUndoConfirmOpen(false);
    try {
      const res = await fetch(`/api/portfolios/rebalance/undo/${activeId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.status === 'success') {
        // Refresh core report data
        const repRes = await fetch(`/api/report/${activeId}`);
        const repData = await repRes.json();
        if (!repData.detail) setData(repData);
        
        // Also refresh historical chart
        fetch(`/api/report/history/${activeId}`)
          .then(async r => {
            const text = await r.text();
            return JSON.parse(text.replace(/:\s*NaN/g, ': null'));
          })
          .then(hData => {
            if (Array.isArray(hData)) {
              setHistoryData(hData.filter(d => d && d.date && d.value !== null && !isNaN(d.value)));
            }
          })
          .catch(() => {});
      } else {
        alert(`Failed to undo: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Error during undo: ${err}`);
    }
  };

  const handleRebalancePreview = async () => {
    if (!activeId) return;
    const params = new URLSearchParams();
    if (rebalanceDate) params.set('as_of_date', rebalanceDate);
    const res = await fetch(`/api/portfolios/rebalance/preview/${activeId}?${params}`);
    const json = await res.json();
    setRebalancePreview(json);
    setShowRebalanceModal(true);
  };

  const handleRebalanceExecute = async () => {
    setLoading(true);
    setShowRebalanceModal(false);
    try {
      const rbRes = await fetch(`/api/portfolios/rebalance/${activeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ as_of_date: rebalanceDate || null })
      });
      if (!rbRes.ok) {
        const err = await rbRes.json().catch(() => ({ detail: 'Unknown server error' }));
        alert(`⚠️ Rebalance 执行失败：${err.detail || rbRes.status}`);
        setLoading(false);
        return;
      }
      // Refresh core report data
      const repRes = await fetch(`/api/report/${activeId}`);
      const repData = await repRes.json();
      if (!repData.detail) setData(repData);

      // Also refresh historical chart so performance curve reflects the new trades
      fetch(`/api/report/history/${activeId}`)
        .then(async r => {
          const text = await r.text();
          const cleanText = text.replace(/:\s*NaN/g, ': null');
          return JSON.parse(cleanText);
        })
        .then(hData => {
          if (Array.isArray(hData)) {
            setHistoryData(hData.filter(d => d && d.date && d.value !== null && !isNaN(d.value)));
          }
        })
        .catch(() => {});
    } catch (e) {
      alert(`⚠️ Rebalance 网络错误：${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleManualDiv = async (e) => {
    e.preventDefault();
    await fetch(`/api/portfolios/dividend/manual/${activeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isin: mDiv.isin, date: mDiv.date, amount_per_share: parseFloat(mDiv.amount) })
    });
    setShowDivModal(false);
    // Refresh report
    const res = await fetch(`/api/report/${activeId}`);
    setData(await res.json());
  };

  const handleOpenManageDivModal = async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/portfolios/dividends/export/${activeId}`);
      if (!res.ok) throw new Error("Failed to fetch dividends");
      const divs = await res.json();
      setDividendHistory(divs);
      setShowManageDivModal(true);
    } catch (err) {
      console.error(err);
      alert("Failed to load dividends");
    }
  };

  const handleDeleteManualDividend = async (divId) => {
    if (!window.confirm("Are you sure you want to delete this manual dividend?")) return;
    try {
      await fetch(`/api/dividends/manual/${divId}`, { method: 'DELETE' });
      const res = await fetch(`/api/portfolios/dividends/export/${activeId}`);
      setDividendHistory(await res.json());
      
      const repRes = await fetch(`/api/report/${activeId}`);
      setData(await repRes.json());
    } catch (err) {
      console.error(err);
      alert("Failed to delete dividend");
    }
  };

  // ── Portfolio Composition Management ──────────────────────────────────────
  const handleOpenCompModal = async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/portfolios/transactions/${activeId}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      const result = await res.json();
      setCompTxs(result.transactions || []);
      setCompTargets(result.target_allocations || {});
      setCompEditing({});
      setCompNewAsset({ isin: '', weight: 0, shares: 0, price: 0 });
      setShowCompModal(true);
    } catch (err) {
      console.error(err);
      alert('Failed to load portfolio composition');
    }
  };

  const handleCompEdit = (txId, field, value) => {
    setCompEditing(prev => ({
      ...prev,
      [txId]: { ...(prev[txId] || {}), [field]: value }
    }));
  };

  const handleCompSave = async (txId) => {
    const edits = compEditing[txId];
    if (!edits) return;
    try {
      // Save transaction changes (isin, shares, price)
      const txUpdate = {};
      if (edits.isin !== undefined) txUpdate.isin = edits.isin;
      if (edits.shares !== undefined) txUpdate.shares = edits.shares;
      if (edits.price !== undefined) txUpdate.price = edits.price;
      if (Object.keys(txUpdate).length > 0) {
        await fetch(`/api/portfolios/transactions/${txId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(txUpdate)
        });
      }
      // Save target weight changes
      if (edits.target_weight !== undefined) {
        const tx = compTxs.find(t => t.id === txId);
        const isin = edits.isin || tx.isin;
        const newTargets = { ...compTargets, [isin]: parseFloat(edits.target_weight) };
        await fetch(`/api/portfolios/${activeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_allocations: newTargets })
        });
      }
      // Refresh
      handleOpenCompModal();
      const repRes = await fetch(`/api/report/${activeId}`);
      setData(await repRes.json());
    } catch (err) {
      console.error(err);
      alert('Failed to save changes');
    }
  };

  const handleCompDelete = async (txId) => {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await fetch(`/api/portfolios/transactions/${txId}`, { method: 'DELETE' });
      handleOpenCompModal();
      const repRes = await fetch(`/api/report/${activeId}`);
      setData(await repRes.json());
    } catch (err) {
      alert('Failed to delete transaction');
    }
  };

  const handleCompAddAsset = async () => {
    if (!compNewAsset.isin || compNewAsset.shares <= 0 || compNewAsset.price <= 0) {
      alert('Please fill in ISIN, shares and price');
      return;
    }
    try {
      await fetch(`/api/portfolios/transactions/${activeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compNewAsset)
      });
      handleOpenCompModal();
      const repRes = await fetch(`/api/report/${activeId}`);
      setData(await repRes.json());
    } catch (err) {
      alert('Failed to add asset');
    }
  };

  const handleExportCSV = () => {
    if (!data) return;
    const headers = ["ASSET", "ISIN", "ALLOCATION (%)", "SHARES", "AVG COST", "PRICE", "VALUE", "DIVIDENDS", "PNL (%)"];
    const rows = data.details.map(a => [
      a.name,
      a.isin,
      (a.market_value / data.total_nav * 100).toFixed(1) + "%",
      a.isin.startsWith('CASH_') ? '1' : Math.floor(a.shares),
      a.total_cost ? (a.total_cost / (a.isin.startsWith('CASH_') ? 1 : a.shares)).toFixed(2) : '0',
      a.price.toFixed(2),
      a.market_value.toFixed(2),
      a.dividends.toFixed(2),
      a.yield.toFixed(2) + "%"
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${portfolios.find(p => p.id === activeId)?.name || 'portfolio'}_holdings.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportDividendsCSV = async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/portfolios/dividends/export/${activeId}`);
      if (!res.ok) throw new Error("Failed to fetch dividends");
      const divs = await res.json();
      
      const headers = ["DATE", "ASSET / ISIN", "FUND NAME", "TYPE", "SHARES HELD", "AMOUNT PER SHARE", "TOTAL DIVIDEND ($)"];
      const rows = divs.map(d => [
        d.date,
        d.isin,
        `"${d.name}"`, // Quote to handle commas in names
        d.type,
        d.shares_held,
        d.amount_per_share.toFixed(4),
        d.total_amount.toFixed(2)
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${portfolios.find(p => p.id === activeId)?.name || 'portfolio'}_dividends.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert("Failed to export dividends data.");
    }
  };

  // ── Strategy Lab Handlers ────────────────────────────────────────────────

  // 点击「预览报告」→ 先弹客户信息弹窗
  const handleGenerateReport = () => {
    if (!labData?.monte_carlo) {
      alert('请先执行蒙特卡洛测算，再生成报告。');
      return;
    }
    setClientInfoModalOpen(true);
  };

  // 用户填写信息后确认 → 保存并打开报告
  const handleClientInfoConfirm = (info) => {
    setClientInfo(info);
    setClientInfoModalOpen(false);
    setReportModalOpen(true);
  };

  // 用户点击跳过 → 清空客户信息，直接打开报告
  const handleClientInfoSkip = () => {
    setClientInfo(null);
    setClientInfoModalOpen(false);
    setReportModalOpen(true);
  };

  // 后端 Word 文档生成（独立触发，与网页报告分开）
  const handleGenerateWordReport = async () => {
    if (!labData?.monte_carlo) {
      alert('请先执行蒙特卡洛测算，再生成报告。');
      return;
    }
    setReportLoading(true);
    try {
      const res = await fetch('/api/lab/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_result: labData,
          client_info: clientInfo || {},
          mc_settings: {
            capital:            Number(labMcSettings.capital),
            years:              Number(labMcSettings.years),
            withdrawal:         Number(labMcSettings.withdrawal),
            withdrawal_start:   Number(labMcSettings.withdrawal_start),
            withdrawal_end:     Number(labMcSettings.withdrawal_end),
            contribution:       Number(labMcSettings.contribution),
            contribution_start: Number(labMcSettings.contribution_start),
            contribution_years: Number(labMcSettings.contribution_years),
            inflation_pct:      Number(labMcSettings.inflation),
            target:             Number(labMcSettings.target),
            stress:             labMcSettings.stress,
          }
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || 'Report generation failed');
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const clientSuffix = clientInfo?.name ? `_${clientInfo.name}` : '';
      a.download = `wealth_report${clientSuffix}_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('报告生成失败：' + err.message);
    } finally {
      setReportLoading(false);
    }
  };

  const handleAddLabIsin = (e) => {
    e.preventDefault();
    if (!labInput.trim()) return;
    const isin = labInput.trim().toUpperCase();
    if (!labIsins.includes(isin)) {
      setLabIsins([...labIsins, isin]);
    }
    setLabInput('');
  };

  const handleRemoveLabIsin = (isin) => {
    setLabIsins(labIsins.filter(i => i !== isin));
  };

  // ─── Scenarios: Save / Load / Delete ───────────────────────────────────────
  const fetchSavedScenarios = async () => {
    try {
      const res = await fetch('/api/lab/scenarios');
      if (!res.ok) { console.warn('fetchSavedScenarios: backend not ready (status', res.status, ')'); return; }
      const data = await res.json();
      setSavedScenarios(Array.isArray(data) ? data : []);
    } catch (e) { console.error('fetchSavedScenarios:', e); }
  };

  useEffect(() => {
    if (activeTab === 'lab') {
      fetchSavedScenarios();
    }
  }, [activeTab]);

  const handleSaveScenario = async () => {
    if (!labData || !scenarioName.trim()) return;
    setScenarioSaving(true);
    try {
      // Build a lean summary from current labData
      const target = labData[labData.mc_target_label];
      const mc = labData.monte_carlo;
      const summary = {
        expected_return: target?.expected_return,
        volatility: target?.volatility,
        sharpe_ratio: target?.sharpe_ratio,
        dividend_yield: target?.dividend_yield,
        irr_p50: mc?.irr?.p50,
        irr_p10: mc?.irr?.p10,
        success_rate: mc?.success_rate,
        capital: labMcSettings.capital,
        withdrawal: labMcSettings.withdrawal,
        years: labMcSettings.years,
      };
      const res = await fetch('/api/lab/scenarios/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scenarioName.trim(),
          assets: labIsins,
          custom_weights: labCustomWeights,
          mc_settings: labMcSettings,
          summary,
          chart_data: mc?.chart || [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveDialogOpen(false);
      setScenarioName('');
      fetchSavedScenarios(); // refresh list
      alert('✅ 方案已保存！');
    } catch (e) {
      alert('保存失败: ' + e.message);
    } finally {
      setScenarioSaving(false);
    }
  };

  const handleLoadScenario = async (id) => {
    try {
      const res = await fetch(`/api/lab/scenarios/${id}`);
      const data = await res.json();
      // Restore assets, weights, settings
      setLabIsins(data.assets);
      setLabCustomWeights(data.weights);
      setLabMode('custom');
      setLabMcSettings(data.mc_settings);
      // Restore chart data into labData structure
      setLabData(prev => ({
        ...(prev || {}),
        ...(data.summary || {}),
        mc_target_label: 'custom_portfolio',
        custom_portfolio: {
          allocations: data.weights,
          expected_return: data.summary.expected_return,
          volatility: data.summary.volatility,
          sharpe_ratio: data.summary.sharpe_ratio,
          dividend_yield: data.summary.dividend_yield,
        },
        monte_carlo: {
          chart: data.chart_data,
          irr: { p50: data.summary.irr_p50, p10: data.summary.irr_p10 },
          success_rate: data.summary.success_rate,
        },
        _restored_from: data.name,
      }));
      setScenariosDrawer(false);
    } catch (e) {
      alert('加载失败: ' + e.message);
    }
  };

  const handleDeleteScenario = async (id) => {
    if (!window.confirm('确认删除此方案？此操作不可撤销。')) return;
    await fetch(`/api/lab/scenarios/${id}`, { method: 'DELETE' });
    fetchSavedScenarios();
  };
  // ───────────────────────────────────────────────────────────────────────────

  const handleRunLabAnalysis = async () => {

    if (labIsins.length < 2) {
      setLabError("Please add at least 2 ISINs to analyze correlations.");
      return;
    }
    
    let submitCustomWeights = null;
    if (labMode === 'custom') {
      const sum = labIsins.reduce((acc, isin) => acc + (parseFloat(labCustomWeights[isin]) || 0), 0);
      if (Math.abs(sum - 100) > 0.1) {
        setLabError(`Custom weights must sum to exactly 100%. Currently: ${sum.toFixed(1)}%`);
        return;
      }
      submitCustomWeights = {};
      labIsins.forEach(isin => {
        submitCustomWeights[isin] = (parseFloat(labCustomWeights[isin]) || 0) / 100;
      });
    }

    setLabLoading(true);
    setLabError(null);
    try {
      const payload = { 
        isins: labIsins, 
        days_back: labDaysBack, 
        max_weight: labMaxWeight, 
        risk_free_rate: 0.04,
        mc_capital: Number(labMcSettings.capital),
        mc_contribution: Number(labMcSettings.contribution),
        mc_contribution_start: Number(labMcSettings.contribution_start),
        mc_contribution_years: Number(labMcSettings.contribution_years),
        mc_withdrawal: Number(labMcSettings.withdrawal),
        mc_withdrawal_start: Number(labMcSettings.withdrawal_start),
        mc_withdrawal_end: Number(labMcSettings.withdrawal_end),
        mc_withdrawal_inflation: labMcSettings.withdrawal_inflation,
        mc_years: Number(labMcSettings.years),
        mc_target: Number(labMcSettings.target),
        mc_stress: labMcSettings.stress,
        mc_inflation: Number(labMcSettings.inflation) / 100,
        _ts: Date.now() // Bust cache
      };
      
      if (insuranceEnabled && insurancePlan) {
        payload.insurance_plan = insurancePlan.years.map(y => ({
          year:           y.year,
          guaranteed_cv:  y.guaranteed_cv,
          non_guaranteed: y.non_guaranteed,
          withdrawal:     y.withdrawal,
          total_cv_base:  y.total_cv_base,
        }));
        payload.insurance_alpha_low  = insuranceAlphaLow;
        payload.insurance_alpha_high = insuranceAlphaHigh;
        payload.insurance_label      = insurancePlan.policy_name || "储蓄分红险";
      }

      if (submitCustomWeights) payload.custom_weights = submitCustomWeights;
      
      const res = await fetch('/api/lab/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Failed to analyze");
      setLabData(result);
    } catch (err) {
      setLabError(err.message);
    } finally {
      setLabLoading(false);
    }
  };

  const handleDeployLabStrategy = (allocations) => {
    // Convert allocations dict to array for the form
    const allocArray = Object.entries(allocations).map(([isin, weight]) => ({
      isin,
      weight: parseFloat(weight).toFixed(3),
      manual_price: ''
    }));
    setNewPf({
      ...newPf,
      name: 'Optimized Strategy',
      allocations: allocArray
    });
    setActiveTab('portfolios');
    setShowModal(true);
  };

  const applyLabTemplate = (isins, specificWeights = null) => {
    setLabIsins(isins);
    if (specificWeights) {
      setLabCustomWeights(specificWeights);
    } else {
      const equalWeight = (100 / isins.length).toFixed(1);
      const weights = {};
      isins.forEach(isin => {
        weights[isin] = equalWeight;
      });
      setLabCustomWeights(weights);
    }
  };

  return (
    <div className="app-layout">
      {/* ── Top Header Bar ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 52, zIndex: 1000,
        background: 'rgba(8,15,35,0.92)',
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px 0 260px',
        justifyContent: 'space-between',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          {currentUser ? `欢迎回来，${currentUser.display_name}` : 'PortfolioHub 财富管理平台'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {currentUser ? (
            <>
              {/* 角色徽章 */}
              <span style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                background: ROLE_META[currentUser.role]?.color || '#6b7280',
                color: '#fff', letterSpacing: '0.02em',
              }}>
                {ROLE_META[currentUser.role]?.label || currentUser.role}
              </span>
              {/* 用户名 */}
              <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>
                {currentUser.display_name}
              </span>
              {/* 登出按钮 */}
              <button
                onClick={handleLogout}
                style={{
                  padding: '4px 14px', borderRadius: 8, background: 'transparent',
                  border: '1px solid rgba(71,85,105,0.6)', color: '#94a3b8',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(71,85,105,0.6)'; e.currentTarget.style.color = '#94a3b8'; }}
              >登出</button>
            </>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              style={{
                padding: '7px 18px', borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                border: 'none', color: '#fff', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                transition: 'all 0.2s',
              }}
            >登录 / 注册</button>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab} setActiveTab={setActiveTab}
        portfolios={portfolios} activeId={activeId} setActiveId={setActiveId}
        setShowModal={setShowModal} setShowBrokerImport={setShowBrokerImport} setShowBrokerSync={setShowBrokerSync}
        setDeleteCandidate={setDeleteCandidate} setShowDeleteModal={setShowDeleteModal}
        savedScenarios={savedScenarios} handleLoadScenario={handleLoadScenario} handleDeleteScenario={handleDeleteScenario}
        currentUser={currentUser} setActiveTab={setActiveTab}
      />

      {/* Main Content */}
      <main className="dashboard-container">
        {activeTab === 'admin' ? (
          <AdminPanel currentUser={currentUser} />
        ) : activeTab === 'advisor' ? (
          <AdvisorClientsPanel currentUser={currentUser} />
        ) : activeTab === 'lab' ? (
          <FeatureLock minRole="premium" currentUser={currentUser} featureName="策略实验室" onLoginClick={() => setAuthModalOpen(true)}>
            <StrategyLabView
              labIsins={labIsins} labInput={labInput} setLabInput={setLabInput}
              labData={labData} labLoading={labLoading} labError={labError}
              labDaysBack={labDaysBack} setLabDaysBack={setLabDaysBack}
              labMaxWeight={labMaxWeight} setLabMaxWeight={setLabMaxWeight}
              labMode={labMode} setLabMode={setLabMode}
              labCustomWeights={labCustomWeights} setLabCustomWeights={setLabCustomWeights}
              labTab={labTab} setLabTab={setLabTab}
              labChartFontSize={labChartFontSize} setLabChartFontSize={setLabChartFontSize}
              labMcSettings={labMcSettings} setLabMcSettings={setLabMcSettings}
              insuranceEnabled={insuranceEnabled} setInsuranceEnabled={setInsuranceEnabled}
              insurancePlan={insurancePlan} setInsurancePlan={setInsurancePlan}
              insuranceAlphaLow={insuranceAlphaLow} setInsuranceAlphaLow={setInsuranceAlphaLow}
              insuranceAlphaHigh={insuranceAlphaHigh} setInsuranceAlphaHigh={setInsuranceAlphaHigh}
              saveDialogOpen={saveDialogOpen} setSaveDialogOpen={setSaveDialogOpen}
              scenarioName={scenarioName} setScenarioName={setScenarioName}
              scenarioSaving={scenarioSaving}
              reportModalOpen={reportModalOpen} setReportModalOpen={setReportModalOpen}
              showMcDoc={showMcDoc} setShowMcDoc={setShowMcDoc}
              handleAddLabIsin={handleAddLabIsin} handleRemoveLabIsin={handleRemoveLabIsin}
              handleRunLabAnalysis={handleRunLabAnalysis} handleDeployLabStrategy={handleDeployLabStrategy}
              handleSaveScenario={handleSaveScenario} applyLabTemplate={applyLabTemplate}
              reportLoading={reportLoading} handleGenerateReport={handleGenerateReport}
              handleGenerateWordReport={handleGenerateWordReport}
              labSum={labSum} isLabReady={isLabReady}
            />
          </FeatureLock>
        ) : activeTab === 'portfolios' && activeId ? (
          loading ? (
            <div style={{textAlign: 'center', paddingTop: '100px'}}><h2>Analyzing Data...</h2></div>
          ) : data && data.details ? (
            <PortfolioView
              portfolios={portfolios} activeId={activeId} data={data} historyData={historyData} loading={loading}
              activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab}
              divProjData={divProjData} divLoading={divLoading} taxRate={taxRate} setTaxRate={setTaxRate}
              dripMode={dripMode} setDripMode={setDripMode}
              sectorData={sectorData} top10Data={top10Data} getDaysUntil={getDaysUntil}
              setShowDivModal={setShowDivModal} setShowRenameModal={setShowRenameModal} setRenameDraft={setRenameDraft}
              handleExportCSV={handleExportCSV} handleExportDividendsCSV={handleExportDividendsCSV}
              handleOpenCompModal={handleOpenCompModal} handleOpenManageDivModal={handleOpenManageDivModal}
              handleRebalancePreview={handleRebalancePreview} handleUndoRebalance={handleUndoRebalance}
            />
          ) : (
            <div style={{textAlign: 'center', paddingTop: '100px'}}><h2>Data Unavailable</h2><p>Please select a different portfolio.</p></div>
          )
        ) : (
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '16px', color: 'rgba(255,255,255,0.3)'}}>
            <div style={{fontSize: '3rem'}}>📊</div>
            <div>Select a portfolio from the sidebar or create a new one</div>
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      <CreatePortfolioModal
        showModal={showModal} setShowModal={setShowModal}
        newPf={newPf} setNewPf={setNewPf} totalWeight={totalWeight}
        handleCreatePortfolio={handleCreatePortfolio}
      />
      <DividendModal
        showDivModal={showDivModal} setShowDivModal={setShowDivModal}
        mDiv={mDiv} setMDiv={setMDiv} handleManualDiv={handleManualDiv}
      />
      <DeleteModal
        showDeleteModal={showDeleteModal} setShowDeleteModal={setShowDeleteModal}
        handleDelete={handleDelete}
      />
      <RenameModal
        showRenameModal={showRenameModal} setShowRenameModal={setShowRenameModal}
        renameDraft={renameDraft} setRenameDraft={setRenameDraft}
        handleRename={handleRename}
      />
      <RebalanceModal
        showRebalanceModal={showRebalanceModal} setShowRebalanceModal={setShowRebalanceModal}
        rebalancePreview={rebalancePreview} rebalanceDate={rebalanceDate} setRebalanceDate={setRebalanceDate}
        handleRebalancePreview={handleRebalancePreview} handleRebalanceExecute={handleRebalanceExecute}
      />
      <ManageDivModal
        showManageDivModal={showManageDivModal} setShowManageDivModal={setShowManageDivModal}
        dividendHistory={dividendHistory} handleDeleteManualDividend={handleDeleteManualDividend}
      />
      <CompositionModal
        showCompModal={showCompModal} setShowCompModal={setShowCompModal}
        compTxs={compTxs} compTargets={compTargets} compEditing={compEditing}
        compNewAsset={compNewAsset} setCompNewAsset={setCompNewAsset}
        handleCompEdit={handleCompEdit} handleCompSave={handleCompSave}
        handleCompDelete={handleCompDelete} handleCompAddAsset={handleCompAddAsset}
        portfolios={portfolios} activeId={activeId}
      />
      <McDocModal showMcDoc={showMcDoc} setShowMcDoc={setShowMcDoc} />
      {clientInfoModalOpen && (
        <ClientInfoModal
          onConfirm={handleClientInfoConfirm}
          onSkip={handleClientInfoSkip}
          onClose={() => setClientInfoModalOpen(false)}
        />
      )}
      {reportModalOpen && labData?.monte_carlo && (
        <WealthReport
          labData={labData} labIsins={labIsins} labMcSettings={labMcSettings}
          insuranceEnabled={insuranceEnabled} insurancePlan={insurancePlan}
          clientInfo={clientInfo}
          onClose={() => setReportModalOpen(false)}
          onGenerateWord={handleGenerateWordReport}
          reportLoading={reportLoading}
        />
      )}
      <BrokerSync show={showBrokerSync} onClose={() => setShowBrokerSync(false)} onImported={fetchPortfolios} />
      <BrokerImport show={showBrokerImport} onClose={() => setShowBrokerImport(false)} onImported={fetchPortfolios} />

      {/* ── Undo Trades Confirm Dialog ── */}
      {undoConfirmOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setUndoConfirmOpen(false)}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '90%',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{fontSize: '2rem', marginBottom: '12px', textAlign: 'center'}}>↩️</div>
            <h3 style={{color: '#fff', marginBottom: '12px', textAlign: 'center', fontSize: '1.1rem'}}>
              Undo Latest Trades
            </h3>
            <p style={{color: 'rgba(255,255,255,0.6)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '24px', textAlign: 'center'}}>
              This will revert the latest batch of transactions (e.g. your last Rebalance). Historical records will be permanently removed.
              <br/><br/>
              <span style={{color: '#ef4444', fontWeight: 600}}>This action cannot be undone.</span>
            </p>
            <div style={{display: 'flex', gap: '12px', justifyContent: 'center'}}>
              <button
                onClick={() => setUndoConfirmOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '10px 24px',
                  cursor: 'pointer', fontWeight: 500
                }}
              >Cancel</button>
              <button
                onClick={handleUndoConfirmed}
                style={{
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none', color: '#fff', borderRadius: '8px', padding: '10px 24px',
                  cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 12px rgba(239,68,68,0.4)'
                }}
              >↩️ Confirm Undo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auth Modal ── */}
      {authModalOpen && (
        <AuthModal
          onSuccess={handleAuthSuccess}
          onClose={() => setAuthModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
