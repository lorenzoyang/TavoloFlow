import type { Names } from "@/lib/language";

// Starting points for a new option group, with the names already written in all three menu languages.
// A template only fills the form: once saved, the group is the restaurant's own and nothing refers back
// here. Prices start at zero and allergens unchecked, because only the owner knows the recipe.
export type OptionTemplate = {
  key: "size" | "sugar" | "ice" | "toppings" | "spice";
  names: Names;
  minSelect: number;
  maxSelect: number;
  options: Names[];
};

const names = (nameZh: string, nameIt: string, nameEn: string): Names => ({
  nameZh,
  nameIt,
  nameEn,
});

export const optionTemplates: OptionTemplate[] = [
  {
    key: "size",
    names: names("杯型", "Formato", "Size"),
    minSelect: 1,
    maxSelect: 1,
    options: [names("中杯", "Media", "Regular"), names("大杯", "Grande", "Large")],
  },
  {
    key: "sugar",
    names: names("甜度", "Zucchero", "Sugar"),
    minSelect: 1,
    maxSelect: 1,
    options: [
      names("无糖 0%", "Senza zucchero 0%", "No sugar 0%"),
      names("微糖 30%", "Poco zucchero 30%", "Light sugar 30%"),
      names("半糖 50%", "Metà zucchero 50%", "Half sugar 50%"),
      names("少糖 70%", "Meno zucchero 70%", "Less sugar 70%"),
      names("正常糖 100%", "Zucchero normale 100%", "Regular sugar 100%"),
    ],
  },
  {
    // Ice and temperature share one group, so a guest can never pick a hot drink with extra ice.
    key: "ice",
    names: names("冰量 / 温度", "Ghiaccio e temperatura", "Ice and temperature"),
    minSelect: 1,
    maxSelect: 1,
    options: [
      names("正常冰", "Ghiaccio normale", "Regular ice"),
      names("少冰", "Poco ghiaccio", "Less ice"),
      names("去冰", "Senza ghiaccio", "No ice"),
      names("温", "Tiepido", "Warm"),
      names("热", "Caldo", "Hot"),
    ],
  },
  {
    key: "toppings",
    names: names("小料", "Topping", "Toppings"),
    minSelect: 0,
    maxSelect: 3,
    options: [
      names("珍珠", "Perle di tapioca", "Tapioca pearls"),
      names("椰果", "Gelatina di cocco", "Coconut jelly"),
      names("草莓爆爆珠", "Popping boba alla fragola", "Strawberry popping boba"),
      names("布丁", "Budino", "Pudding"),
      names("仙草", "Grass jelly", "Grass jelly"),
      names("芋圆", "Palline di taro", "Taro balls"),
      names("奶盖", "Schiuma al formaggio", "Cheese foam"),
    ],
  },
  {
    key: "spice",
    names: names("辣度", "Piccantezza", "Spice level"),
    minSelect: 1,
    maxSelect: 1,
    options: [
      names("不辣", "Non piccante", "Not spicy"),
      names("微辣", "Poco piccante", "Mild"),
      names("中辣", "Piccante", "Medium"),
      names("特辣", "Molto piccante", "Extra hot"),
    ],
  },
];
