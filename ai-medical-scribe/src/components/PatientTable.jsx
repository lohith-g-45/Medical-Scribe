import { motion } from 'framer-motion';
import { Eye, Calendar } from 'lucide-react';
import { formatDate, formatTime } from '../utils/helpers';

const PatientTable = ({ patients, onViewPatient }) => {

  if (!patients || patients.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">No patient records found</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Patient Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Age / Gender
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Last Visit
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Diagnosis
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Visits
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {patients.map((patient, index) => (
              <motion.tr
                key={patient.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs mr-3 shrink-0" style={{ backgroundColor: '#EFF6FF', color: '#2563EB', border: '1.5px solid #BFDBFE' }}>
                      {patient.id}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {patient.name}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{patient.age} years</div>
                  <div className="text-xs text-gray-500">{patient.gender}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-gray-900">
                    <Calendar size={14} className="mr-2 text-gray-400" />
                    <span>
                      {formatDate(patient.lastVisit)}
                      <span className="text-gray-500 ml-2">{formatTime(patient.lastVisit)}</span>
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 max-w-xs truncate">
                    {patient.diagnosis}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    {patient.consultations || 0}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onViewPatient(patient.id)}
                    className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-medium text-sm"
                  >
                    <Eye size={15} />
                    <span>View</span>
                  </motion.button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PatientTable;
