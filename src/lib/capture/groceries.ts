/** Lowercase single words (en + de) that make a short capture a shopping item. */
export const GROCERIES: ReadonlySet<string> = new Set(
	`milk eggs egg bread butter cheese yogurt yoghurt cream apples apple bananas banana oranges
	orange lemons lemon grapes strawberries berries potatoes potato onions onion garlic tomatoes
	tomato cucumber carrots carrot lettuce spinach broccoli peppers mushrooms avocado rice pasta
	noodles flour sugar salt pepper oil vinegar coffee tea juice water beer wine chicken beef pork
	bacon ham sausage fish salmon tuna tofu cereal oats oatmeal muesli honey jam chocolate cookies
	chips nuts snacks ketchup mustard mayo sauce soup toothpaste shampoo soap detergent sponges
	tissues napkins diapers
	milch eier brot brötchen butter käse joghurt sahne quark äpfel apfel bananen orangen zitronen
	trauben erdbeeren kartoffeln zwiebeln knoblauch tomaten gurke karotten möhren salat spinat
	brokkoli paprika pilze reis nudeln mehl zucker salz pfeffer öl essig kaffee tee saft wasser
	bier wein hähnchen rindfleisch schweinefleisch speck schinken wurst fisch lachs thunfisch
	müsli haferflocken honig marmelade schokolade kekse nüsse senf zahnpasta seife waschmittel
	spülmittel klopapier toilettenpapier taschentücher küchenrolle windeln`.split(/\s+/)
);
