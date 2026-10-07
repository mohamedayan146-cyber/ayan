
const productName: string = "Wireless Mouse";
const price: number = 29.99;
const discountAvailable: boolean = true;

function getDiscount(price: number, discount: number): number {
  return price - price * discount;
}

console.log(getDiscount(100, 0.2)); // 80

function printLength(x: string): void {
  console.log(x.length);
}

printLength("Hello"); 