import { useReducer } from "react";

const initialState = {
  step: 1,
  firstName: "Eng duniya",
  lastName: "Updy",
  email: "duniya@gmail.com",
  phone: "0988776654",
};

const reducer = (state, action) => {
  switch (action.type) {
    case "UPDATE_FIELD":
      return { ...state, [action.field]: action.value };
    case "NEXT_STEP":
      return { ...state, step: state.step + 1 };
    case "PREV_STEP":
      return { ...state, step: state.step - 1 };
    case "RESET_FORM":
      return initialState;
    default:
      return state;
  }
};

const MultiStepForm = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const updateField = (field, value) => {
    dispatch({ type: "UPDATE_FIELD", field, value });
  };

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return (
          <div>
            <h2>Step 1: Profile</h2>
            <input
              placeholder="First Name"
              value={state.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
            />
            <input
              placeholder="Last Name"
              value={state.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
            />
            <br />
            <button onClick={() => dispatch({ type: "NEXT_STEP" })}>Next</button>
          </div>
        );

      case 2:
        return (
          <div>
            <h2>Step 2: Contact</h2>
            <input
              placeholder="Email"
              value={state.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
            <input
              placeholder="Phone"
              value={state.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />
            <br />
            <button onClick={() => dispatch({ type: "PREV_STEP" })}>Back</button>
            <button onClick={() => dispatch({ type: "NEXT_STEP" })}>Next</button>
          </div>
        );

      case 3:
        return (
          <div>
            <h2>Step 3: Review</h2>
            <p>First Name: {state.firstName}</p>
            <p>Last Name: {state.lastName}</p>
            <p>Email: {state.email}</p>
            <p>Phone: {state.phone}</p>
            <button onClick={() => dispatch({ type: "PREV_STEP" })}>Back</button>
            <button onClick={() => {
              alert("Form submitted!");
              dispatch({ type: "RESET_FORM" });
            }}>
              Confirm & Submit
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return <div>{renderStep()}</div>;
};

export default MultiStepForm;