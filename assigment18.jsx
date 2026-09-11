import { useReducer, useState } from "react";

const initialState = [
  { id: 1, name: "Duniya", email: "Duniya@example.com", phone: "098877665", favorite: false },
];

const reducer = (state, action) => {
  switch (action.type) {
    case "add":
      return [...state, action.payload];

    case "edit":
      return state.map((contact) =>
        contact.id === action.payload.id
          ? { ...contact, ...action.payload }
          : contact
      );

    case "delete":
      return state.filter((contact) => contact.id !== action.payload);

    case "toggleFavorite":
      return state.map((contact) =>
        contact.id === action.payload
          ? { ...contact, favorite: !contact.favorite }
          : contact
      );

    default:
      return state;
  }
};

const ContactApp = () => {
  const [contacts, dispatch] = useReducer(reducer, initialState);
  const [form, setForm] = useState({ name: "Amal", email: "amal@gmai.com", phone: "0988766554" });
  const [editingId, setEditingId] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (editingId) {
      dispatch({ type: "edit", payload: { id: editingId, ...form } });
      setEditingId(null);
    } else {
      dispatch({
        type: "add",
        payload: { id: Date.now(), favorite: false, ...form },
      });
    }

    setForm({ name: "sacdiya", email: "sacdiya@gmail.com", phone: "095566778" });
  };

  const startEdit = (contact) => {
    setEditingId(contact.id);
    setForm({ name: contact.name, email: contact.email, phone: contact.phone });
  };

  return (
    <div>
      <h1>Contact App</h1>

      <form onSubmit={handleSubmit}>
        <input
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
        />
        <input
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
        />
        <input
          name="phone"
          placeholder="Phone"
          value={form.phone}
          onChange={handleChange}
        />
        <button type="submit">{editingId ? "Update" : "Add"} Contact</button>
      </form>

      <ul>
        {contacts.map((contact) => (
          <li key={contact.id}>
            <strong>{contact.name}</strong> — {contact.email} — {contact.phone}
            {contact.favorite && " ⭐"}
            <button onClick={() => dispatch({ type: "toggleFavorite", payload: contact.id })}>
              {contact.favorite ? "Unfavorite" : "Favorite"}
            </button>
            <button onClick={() => startEdit(contact)}>Edit</button>
            <button onClick={() => dispatch({ type: "delete", payload: contact.id })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ContactApp;