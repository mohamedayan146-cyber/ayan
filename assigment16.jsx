import { useReducer } from "react";

const products = [
  { id: 1, name: "Widget", price: 11.99 },
  { id: 2, name: "Gadget", price: 24.99 },
];

const initialState = { cart: [] };

const reducer = (state, action) => {
  switch (action.type) {
    case "ADD_TO_CART":
      return { ...state, cart: [...state.cart, action.product] };
    case "REMOVE_FROM_CART":
      return {
        ...state,
        cart: state.cart.filter((item) => item.cartId !== action.cartId),
      };
    default:
      return state;
  }
};

const ShoppingCart = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addToCart = (product) => {
    dispatch({
      type: "ADD_TO_CART",
      product: { ...product, cartId: Date.now() },
    });
  };

  const removeFromCart = (cartId) => {
    dispatch({ type: "REMOVE_FROM_CART", cartId });
  };

  return (
    <div>
      {products.map((product) => (
        <div key={product.id}>
          <h2>{product.name}</h2>
          <p>Price: ${product.price.toFixed(2)}</p>
          <button onClick={() => addToCart(product)}>Add to Cart</button>
        </div>
      ))}

      <h1>Cart Summary</h1>
      <p>Total Items: {state.cart.length}</p>
      <ul>
        {state.cart.map((item) => (
          <li key={item.cartId}>
            {item.name} - ${item.price.toFixed(2)}{" "}
            <button onClick={() => removeFromCart(item.cartId)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ShoppingCart;