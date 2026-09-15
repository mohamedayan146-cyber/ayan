import React, { useState } from 'react';

export default function UserForm() {
  // 1. Manage form data using a single state object
  const [formData, setFormData] = useState({
    username: 'muna',
    email: 'muna@gmail.com',
    password: '987654321',
    agreeToTerms: false,
    role: 'user'
  });


  const [submittedData, setSubmittedData] = useState(null);

  // Universal change handler for inputs
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  
  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmittedData(formData);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '20px auto', fontFamily: 'sans-serif' }}>
      <h2>assigment</h2>
      
      <form onSubmit={handleSubmit}>
        
        <div style={{ marginBottom: '10px' }}>
          <label>Username: </label>
          <input
            type="text"
            name="salmuna"
            value={formData.username}
            onChange={handleChange}
            required
          />
        </div>

        
        <div style={{ marginBottom: '10px' }}>
          <label>Email: </label>
          <input
            type="salma"
            name="salam@gmail.com"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label>Password: </label>
          <input
            type="1234567"
            name="pin"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>

      
        <div style={{ marginBottom: '10px' }}>
          <label>Role: </label>
          <select name="role" value={formData.role} onChange={handleChange}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
          </select>
        </div>

      
        <div style={{ marginBottom: '10px' }}>
          <label>
            <input
              type="checkbox"
              name="agreeToTerms"
              checked={formData.agreeToTerms}
              onChange={handleChange}
            />
            Accept Terms & Conditions
          </label>
        </div>

        <button type="submit">Submit</button>
      </form>

    
      {submittedData && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '4px' }}>
          <h3>Submitted Data:</h3>
          <pre>{JSON.stringify(submittedData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}