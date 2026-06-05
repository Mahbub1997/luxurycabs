export interface DemoDriver {
  name: string;
  phone: string;
  photo: string;
  rating: number;
  trips: number;
  vehicle_number: string;
  vehicle_model: string;
}

const SEDANS = ["Toyota Etios", "Honda Amaze", "Maruti Dzire", "Hyundai Aura"];
const SUVS = ["Toyota Innova", "Mahindra XUV500", "Tata Safari", "Kia Carens"];

const POOL: Omit<DemoDriver, "vehicle_model" | "vehicle_number">[] = [
  { name: "Rajesh Kumar",  phone: "+91 98765 43210", photo: "https://i.pravatar.cc/200?img=12", rating: 4.9, trips: 1287 },
  { name: "Imran Shaikh",  phone: "+91 99887 76655", photo: "https://i.pravatar.cc/200?img=15", rating: 4.8, trips: 942  },
  { name: "Suresh Patil",  phone: "+91 90909 80807", photo: "https://i.pravatar.cc/200?img=33", rating: 4.9, trips: 2104 },
  { name: "Arvind Yadav",  phone: "+91 93940 12120", photo: "https://i.pravatar.cc/200?img=68", rating: 4.7, trips: 651  },
  { name: "Manoj Verma",   phone: "+91 91234 56789", photo: "https://i.pravatar.cc/200?img=51", rating: 5.0, trips: 1890 },
];

function plate() {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const r = (n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
  const n = (n: number) => Math.floor(Math.random() * Math.pow(10, n)).toString().padStart(n, "0");
  return `MH ${n(2)} ${r(2)} ${n(4)}`;
}

export function pickDemoDriver(vehicle: "sedan" | "suv"): DemoDriver {
  const base = POOL[Math.floor(Math.random() * POOL.length)];
  const models = vehicle === "sedan" ? SEDANS : SUVS;
  return {
    ...base,
    vehicle_number: plate(),
    vehicle_model: models[Math.floor(Math.random() * models.length)],
  };
}
