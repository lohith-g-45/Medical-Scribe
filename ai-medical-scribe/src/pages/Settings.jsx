import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Building, Bell, Lock, Save, Mic } from 'lucide-react';
import Header from '../components/layout/Header';
import { useAppContext } from '../context/AppContext';
import { updateUserProfile, updateUserSettings } from '../services/api';
import { useToast } from '../components/Toast';
import VoiceEnrollment from '../components/VoiceEnrollment';

const Settings = () => {
  const { user, setUser } = useAppContext();
  const toast = useToast();
  
  const [profileData, setProfileData] = useState({
    name: user?.name || 'Dr. Sarah Johnson',
    email: user?.email || 'sarah.johnson@hospital.com',
    specialization: user?.specialization || 'Internal Medicine',
    hospital: user?.hospital || 'City General Hospital',
    phone: '+1 (555) 123-4567',
    license: 'MD-123456',
  });

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    consultationReminders: true,
    noteCompletionAlerts: false,
    weeklyReports: true,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handleNotificationChange = (e) => {
    const { name, checked } = e.target;
    setNotifications(prev => ({ ...prev, [name]: checked }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      if (!user?.id) {
        throw new Error('User not available');
      }

      const response = await updateUserProfile(user.id, {
        name: profileData.name,
        email: profileData.email,
        specialization: profileData.specialization,
      });

      setUser({ ...user, ...(response?.user || {}) });
      
      toast.success('Profile updated successfully!');
    } catch (error) {
      toast.error(error?.error || error?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      if (!user?.id) {
        throw new Error('User not available');
      }

      await updateUserSettings(user.id, notifications);
      toast.success('Notification settings updated!');
    } catch (error) {
      toast.error(error?.error || error?.message || 'Failed to update settings');
    }
  };

  return (
    <div className="min-h-screen">
      <Header 
        title="Settings" 
        subtitle="Manage your profile and preferences"
      />
      
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Profile Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div className="flex items-center space-x-3 mb-6">
              <User className="text-primary" size={24} />
              <h2 className="text-xl font-bold text-gray-900">
                Profile Information
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={profileData.name}
                  onChange={handleProfileChange}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={profileData.email}
                  onChange={handleProfileChange}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Specialization
                </label>
                <input
                  type="text"
                  name="specialization"
                  value={profileData.specialization}
                  onChange={handleProfileChange}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={profileData.phone}
                  onChange={handleProfileChange}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Medical License
                </label>
                <input
                  type="text"
                  name="license"
                  value={profileData.license}
                  onChange={handleProfileChange}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hospital/Clinic
                </label>
                <input
                  type="text"
                  name="hospital"
                  value={profileData.hospital}
                  onChange={handleProfileChange}
                  className="input-field"
                />
              </div>
            </div>

            <div className="mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="btn-primary flex items-center space-x-2"
              >
                <Save size={18} />
                <span>{isSaving ? 'Saving...' : 'Save Profile'}</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Hospital Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card"
          >
            <div className="flex items-center space-x-3 mb-6">
              <Building className="text-primary" size={24} />
              <h2 className="text-xl font-bold text-gray-900">
                Hospital Information
              </h2>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Facility Name</p>
                  <p className="font-semibold text-gray-900">{profileData.hospital}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Department</p>
                  <p className="font-semibold text-gray-900">{profileData.specialization}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">License Number</p>
                  <p className="font-semibold text-gray-900">{profileData.license}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Notification Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card"
          >
            <div className="flex items-center space-x-3 mb-6">
              <Bell className="text-primary" size={24} />
              <h2 className="text-xl font-bold text-gray-900">
                Notification Preferences
              </h2>
            </div>

            <div className="space-y-4">
              {Object.entries({
                emailNotifications: 'Email Notifications',
                consultationReminders: 'Consultation Reminders',
                noteCompletionAlerts: 'Note Completion Alerts',
                weeklyReports: 'Weekly Summary Reports',
              }).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <span className="text-gray-700 font-medium">{label}</span>
                  <input
                    type="checkbox"
                    name={key}
                    checked={notifications[key]}
                    onChange={handleNotificationChange}
                    className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveNotifications}
                className="btn-primary flex items-center space-x-2"
              >
                <Save size={18} />
                <span>Save Preferences</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Voice Enrollment */}
          <div className="card shadow-none hover:shadow-none">
            <div className="flex items-center space-x-3 mb-6">
              <Mic className="text-primary" size={24} />
              <h2 className="text-xl font-bold text-gray-900">
                Voice Enrollment
              </h2>
            </div>

            <VoiceEnrollment />
          </div>

          {/* Security Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card"
          >
            <div className="flex items-center space-x-3 mb-6">
              <Lock className="text-primary" size={24} />
              <h2 className="text-xl font-bold text-gray-900">
                Security
              </h2>
            </div>

            <div className="space-y-4">
              <button className="w-full text-left p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <p className="font-medium text-gray-900 mb-1">Change Password</p>
                <p className="text-sm text-gray-600">Update your account password</p>
              </button>

              <button className="w-full text-left p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <p className="font-medium text-gray-900 mb-1">Two-Factor Authentication</p>
                <p className="text-sm text-gray-600">Add an extra layer of security</p>
              </button>

              <button className="w-full text-left p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <p className="font-medium text-gray-900 mb-1">Active Sessions</p>
                <p className="text-sm text-gray-600">Manage your active login sessions</p>
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
