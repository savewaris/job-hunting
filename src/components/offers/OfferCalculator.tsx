'use client';

import React, { useState } from 'react';
import { JobOffer, JobApplication } from '@/types';
import { Calculator, DollarSign, Award, Plus, Check } from 'lucide-react';

interface OfferCalculatorProps {
  offers: JobOffer[];
  applications: JobApplication[];
  onAddOffer: (offer: Omit<JobOffer, 'id'>) => void;
}

export const OfferCalculator: React.FC<OfferCalculatorProps> = ({
  offers,
  applications,
  onAddOffer,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState(applications[0]?.id || '');
  const [baseSalary, setBaseSalary] = useState(210000);
  const [signingBonus, setSigningBonus] = useState(20000);
  const [annualBonusPercent, setAnnualBonusPercent] = useState(15);
  const [equityValue, setEquityValue] = useState(60000);
  const [benefitsScore, setBenefitsScore] = useState(8);
  const [remoteFlexibility, setRemoteFlexibility] = useState('Remote');

  const calculateTotalComp = (off: JobOffer) => {
    const annualBonus = (off.baseSalary * off.annualBonusPercent) / 100;
    const annualEquity = off.equityValue / 4; // 4-year vesting baseline
    return off.baseSalary + annualBonus + annualEquity;
  };

  const handleCreateOffer = (e: React.FormEvent) => {
    e.preventDefault();
    const app = applications.find((a) => a.id === selectedAppId);
    if (!app) return;

    onAddOffer({
      jobApplicationId: selectedAppId,
      companyName: app.companyName,
      jobTitle: app.jobTitle,
      baseSalary: Number(baseSalary),
      signingBonus: Number(signingBonus),
      annualBonusPercent: Number(annualBonusPercent),
      equityValue: Number(equityValue),
      benefitsScore: Number(benefitsScore),
      remoteFlexibility,
      status: 'pending',
    });

    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <Calculator className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Job Offer & Salary Negotiation Calculator</h2>
            <p className="text-xs text-slate-400">Compare Total Annual Compensation (TC), equity vesting, and perks across offers.</p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Add Offer</span>
        </button>
      </div>

      {/* Offer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {offers.length === 0 ? (
          <div className="col-span-3 p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
            <Calculator className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p>No job offers logged yet. Add your first offer to compare compensation.</p>
          </div>
        ) : (
          offers.map((off) => {
            const totalComp = calculateTotalComp(off);
            return (
              <div
                key={off.id}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-xl transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-bold text-white">{off.companyName}</h3>
                    <p className="text-xs text-slate-400">{off.jobTitle}</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {off.status.toUpperCase()}
                  </span>
                </div>

                <div className="p-4 bg-slate-850 rounded-xl border border-slate-800 text-center space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Est. Annual TC</span>
                  <p className="text-2xl font-black text-emerald-400">${totalComp.toLocaleString()}/yr</p>
                </div>

                <div className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Base Salary:</span>
                    <span className="font-semibold text-white">${off.baseSalary.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Signing Bonus:</span>
                    <span className="font-semibold text-white">${off.signingBonus.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Annual Performance Bonus:</span>
                    <span className="font-semibold text-white">{off.annualBonusPercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Equity (4yr Grant):</span>
                    <span className="font-semibold text-white">${off.equityValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Work Policy:</span>
                    <span className="font-semibold text-purple-300">{off.remoteFlexibility}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Benefits & Perks Score:</span>
                    <span className="font-semibold text-amber-300">{off.benefitsScore} / 10</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Offer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Log Job Offer Package</h3>
            <form onSubmit={handleCreateOffer} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Select Job Application</label>
                <select
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.jobTitle} @ {app.companyName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Base Salary ($)</label>
                  <input
                    type="number"
                    required
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Signing Bonus ($)</label>
                  <input
                    type="number"
                    value={signingBonus}
                    onChange={(e) => setSigningBonus(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Annual Bonus (%)</label>
                  <input
                    type="number"
                    value={annualBonusPercent}
                    onChange={(e) => setAnnualBonusPercent(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Equity Grant ($ total)</label>
                  <input
                    type="number"
                    value={equityValue}
                    onChange={(e) => setEquityValue(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Benefits Score (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={benefitsScore}
                    onChange={(e) => setBenefitsScore(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">Work Policy</label>
                  <input
                    type="text"
                    value={remoteFlexibility}
                    onChange={(e) => setRemoteFlexibility(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold"
                >
                  Save Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
