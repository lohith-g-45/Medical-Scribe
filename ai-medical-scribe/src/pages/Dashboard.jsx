import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, FileText, Activity, Mic, Calendar } from 'lucide-react';
import Header from '../components/layout/Header';
import StatCard from '../components/StatCard';
import Loading from '../components/Loading';
import { getDashboardStats, getRecentConsultations } from '../services/api';
import { formatDate } from '../utils/helpers';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentConsultations, setRecentConsultations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadDashboardData();
    // Live refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, recentData] = await Promise.all([
        getDashboardStats(),
        getRecentConsultations(8),
      ]);
      setStats(statsData);
      setRecentConsultations(recentData.consultations || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading dashboard:', error);
      if (!stats) {
        setStats({ consultationsToday: 0, todayTrend: 'No data', totalPatients: 0, notesGenerated: 0, averageTime: '0 min', consultationsThisWeek: 0, newPatientsThisWeek: 0, followUpsThisWeek: 0 });
      }
      setRecentConsultations([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Loading fullScreen />;
  }

  return (
    <div className="min-h-screen">
      <Header 
        title="Dashboard" 
        subtitle="Welcome back! Here's your overview for today"
      />
      
      <div className="p-8">
        {/* Live indicator */}
        <div className="flex items-center justify-end mb-4 space-x-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-xs text-gray-400">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Loading...'}
          </span>
          <button
            onClick={loadDashboardData}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2"
          >
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={Activity}
            title="Consultations Today"
            value={stats?.consultationsToday || 0}
            trend="Today's count"
            color="primary"
          />
          <StatCard
            icon={Users}
            title="Total Patients"
            value={stats?.totalPatients || 0}
            trend="Active records"
            color="accent"
          />
          <StatCard
            icon={FileText}
            title="AI Notes Generated"
            value={stats?.notesGenerated || 0}
            trend="Today's consultations"
            color="success"
          />
          <StatCard
            icon={Calendar}
            title="Avg. Consultation"
            value={stats?.averageTime || '0 min'}
            trend="Per session"
            color="warning"
          />
        </div>

        {/* Recent Consultations and Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Consultations */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  Recent Consultations
                </h2>
                <button
                  onClick={() => navigate('/patients')}
                  className="text-sm text-primary hover:text-blue-700 font-medium"
                >
                  View All
                </button>
              </div>

              <div className="space-y-4">
                {recentConsultations.map((consultation, index) => (
                  <motion.div
                    key={consultation.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => navigate(`/patients/${consultation.patientId}`)}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xs shrink-0" style={{ backgroundColor: '#EFF6FF', color: '#2563EB', border: '1.5px solid #BFDBFE' }}>
                        {consultation.patientId}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {consultation.patientName}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {consultation.diagnosis}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {consultation.time}
                      </p>
                      <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
                        <span>{formatDate(consultation.date)}</span>
                        {consultation.duration && (
                          <span className="text-blue-600 font-medium">
                            {consultation.duration} min
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}

                {recentConsultations.length === 0 && (
                  <p className="text-sm text-gray-500">No recent consultations found.</p>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            {/* Start Consultation Card */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="card bg-gradient-to-br from-primary to-blue-700 text-white cursor-pointer"
              onClick={() => navigate('/consultation')}
            >
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <Mic size={30} className="text-blue-700" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-center mb-2">
                Start New Consultation
              </h3>
              <p className="text-center text-blue-100 text-sm">
                Begin recording and generate AI medical notes
              </p>
            </motion.div>

            {/* Quick Stats */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                This Week
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Consultations</span>
                  <span className="font-semibold text-gray-900">{stats?.consultationsThisWeek ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">New Patients</span>
                  <span className="font-semibold text-gray-900">{stats?.newPatientsThisWeek ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Follow-ups</span>
                  <span className="font-semibold text-gray-900">{stats?.followUpsThisWeek ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
