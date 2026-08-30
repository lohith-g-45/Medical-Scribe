import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Filter } from 'lucide-react';
import Header from '../components/layout/Header';
import PatientTable from '../components/PatientTable';
import SearchBar from '../components/SearchBar';
import Loading from '../components/Loading';
import { fetchPatients, fetchConsultations } from '../services/api';
import { debounce } from '../utils/helpers';

const PatientRecords = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [searchQuery, dateFilter, patients]);

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      const [patientsRes, consultationsRes] = await Promise.all([
        fetchPatients('', 200, 0),
        fetchConsultations({ limit: 500, offset: 0 }),
      ]);

      const patientsList = patientsRes?.patients || [];
      const consultations = consultationsRes?.consultations || [];

      const consultationsByPatient = consultations.reduce((acc, c) => {
        const key = String(c.patient_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(c);
        return acc;
      }, {});

      const mappedPatients = patientsList
        .map((p) => {
          const patientConsultations = consultationsByPatient[String(p.id)] || [];
          const latest = patientConsultations[0] || null;
          const lastVisit = latest?.visit_date || p.updated_at || p.created_at || new Date().toISOString();

          return {
            id: p.id,
            name: p.patient_name,
            age: p.age,
            gender: p.gender,
            lastVisit: lastVisit,
            diagnosis: latest?.diagnosis || 'No diagnosis recorded',
            consultations: patientConsultations.length,
          };
        })
        .sort((a, b) => Number(a.id) - Number(b.id));

      setPatients(mappedPatients);
      setFilteredPatients(mappedPatients);
    } catch (error) {
      console.error('Error loading patients:', error);
      setPatients([]);
      setFilteredPatients([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterPatients = () => {
    let filtered = [...patients].sort((a, b) => Number(a.id) - Number(b.id));

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(patient =>
        patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        patient.diagnosis.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Date filter
    const today = new Date();
    if (dateFilter === 'today') {
      filtered = filtered.filter(patient => {
        const visitDate = new Date(patient.lastVisit);
        return visitDate.toDateString() === today.toDateString();
      });
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(patient => {
        const visitDate = new Date(patient.lastVisit);
        return visitDate >= weekAgo;
      });
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(patient => {
        const visitDate = new Date(patient.lastVisit);
        return visitDate >= monthAgo;
      });
    }

    setFilteredPatients(filtered);
  };

  const handleSearch = debounce((query) => {
    setSearchQuery(query);
  }, 300);

  const handleViewPatient = (patientId) => {
    navigate(`/patients/${patientId}`);
  };

  if (isLoading) {
    return <Loading fullScreen />;
  }

  return (
    <div className="min-h-screen">
      <Header 
        title="Patient Records" 
        subtitle="View and manage patient consultation history"
      />
      
      <div className="p-8">
        <div className="mb-6">
          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <SearchBar
                placeholder="Search patients by name or diagnosis..."
                onSearch={handleSearch}
              />
            </div>
            
            <div className="flex items-center space-x-3">
              <Filter className="text-gray-500" size={20} />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-gray-600 mt-4"
          >
            Showing {filteredPatients.length} of {patients.length} patients
          </motion.p>
        </div>

        {/* Patient Table */}
        <PatientTable
          patients={filteredPatients}
          onViewPatient={handleViewPatient}
        />
      </div>
    </div>
  );
};

export default PatientRecords;
