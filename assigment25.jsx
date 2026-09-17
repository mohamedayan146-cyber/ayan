import { useState } from "react";

const recipesData = [
  {
    id: 1,
    title: "Classic Chocolate Cake",
    description: "Rich and moist chocolate cake perfect for any occasion",
    category: "desserts",
  },
  {
    id: 2,
    title: "Spaghetti Carbonara",
    description: "Traditional Italian pasta with creamy egg sauce",
    category: "dinner",
  },
  {
    id: 3,
    title: "Greek Salad",
    description: "Fresh Mediterranean salad with feta cheese",
    category: "lunch",
  },
  {
    id: 4,
    title: "Breakfast Smoothie Bowl",
    description: "Healthy and colorful breakfast bowl",
    category: "breakfast",
  },
];

const categoryColors = {
  desserts: "bg-pink-100 text-pink-600",
  dinner: "bg-purple-100 text-purple-600",
  lunch: "bg-green-100 text-green-600",
  breakfast: "bg-yellow-100 text-yellow-600",
};

const RecipeBook = () => {
  const [recipes] = useState(recipesData);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="flex justify-between items-center px-10 py-5 bg-white shadow-sm">
        <h1 className="text-2xl font-bold text-red-600">Recipe Book</h1>
        <div className="flex gap-8 text-gray-600 font-medium">
          <a href="#" className="hover:text-red-600">Home</a>
          <a href="#" className="text-red-600 font-semibold">Recipes</a>
          <a href="#" className="hover:text-red-600">Categories</a>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-10 py-10">
        <h2 className="text-3xl font-bold text-gray-800 mb-8">All Recipes</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition"
            >
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {recipe.title}
              </h3>
              <p className="text-gray-500 mb-4">{recipe.description}</p>
              <span
                className={`inline-block text-sm font-medium px-3 py-1 rounded-full ${categoryColors[recipe.category]}`}
              >
                {recipe.category}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecipeBook;