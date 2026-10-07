
function echo<T>(input: T): T {
  return input;
}

const s = echo("hello");         
const n = echo(42);             
const a = echo([1, 2, 3]);        
const o = echo({ id: 1, name: "Ann" }); 

console.log(s.toUpperCase());    
console.log(n.toFixed(2));        
console.log(a.length);        
console.log(o.name);              

// 2. Generic interface
interface ApiResult<T> {
  status: string;
  data: T;
}

const stringResult: ApiResult<string> = {
  status: "alright",
  data: "Hi",
};

const userResult: ApiResult<{ id: number; name: string }> = {
  status: "ok",
  data: { id: 1, name: "Alma" },
};

console.log(stringResult.data.toUpperCase());
console.log(userResult.data.name);


function first<T>(items: T[]): T | undefined {
  return items[0];
}

const firstNum = first([20, 30, 40]);            
const firstStr = first(["a", "b", "c"]);        
const firstObj = first([{ id: 1 }, { id: 2 }]);  

console.log(firstNum, firstStr, firstObj);