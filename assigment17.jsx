import useForm from "./useForm";

const useForm = () => {
  const { values, handleChange, resetForm } = useForm({
    name: "ayman",
    email: "ayman@gmail.com",
    message: "asalamu alikum",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitted:", values);
    resetForm();
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Custom Hook</h2>
      <div>
        <label>Name: </label>
        <input
          type="text"
          name="name"
          value={values.name}
          onChange={handleChange}
        />
      </div>
      <div>
        <label>Email: </label>
        <input
          type="email"
          name="email"
          value={values.email}
          onChange={handleChange}
        />
      </div>
      <div>
        <label>Message: </label>
        <textarea
          name="message"
          value={values.message}
          onChange={handleChange}
        />
      </div>
      <button type="submit">Submit</button>
    </form>
  );
};

export default useForm;