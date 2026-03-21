-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "swatchShape" TEXT NOT NULL DEFAULT 'square',
    "swatchSize" INTEGER NOT NULL DEFAULT 36,
    "swatchSpacing" INTEGER NOT NULL DEFAULT 6,
    "borderWidth" INTEGER NOT NULL DEFAULT 2,
    "borderColor" TEXT NOT NULL DEFAULT '#e1e3e5',
    "tooltipBehavior" TEXT NOT NULL DEFAULT 'hover',
    "tooltipDelay" INTEGER NOT NULL DEFAULT 300,
    "customCss" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerGroup_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Section',
    "visibility" TEXT NOT NULL DEFAULT 'visible',
    "makeIt" TEXT NOT NULL DEFAULT 'hidden',
    "conditionJson" TEXT,
    "columns" INTEGER NOT NULL DEFAULT 3,
    "rows" INTEGER NOT NULL DEFAULT 3,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Section_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'input',
    "title" TEXT NOT NULL,
    "fieldCode" TEXT NOT NULL DEFAULT '',
    "price" REAL NOT NULL DEFAULT 0,
    "priceType" TEXT NOT NULL DEFAULT 'fixed',
    "sku" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "validation" TEXT,
    "maxLength" INTEGER,
    "customerGroups" TEXT,
    "conditionJson" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'visible',
    "makeIt" TEXT NOT NULL DEFAULT 'hidden',
    "tooltip" TEXT,
    "cssClass" TEXT,
    "htmlAttributes" TEXT,
    "hideSkuInCart" BOOLEAN NOT NULL DEFAULT false,
    "hideOnFocus" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Field_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "priceModifier" REAL NOT NULL DEFAULT 0,
    "priceType" TEXT NOT NULL DEFAULT 'fixed',
    "skuModifier" TEXT,
    "imageUrl" TEXT,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FieldRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fieldId" TEXT NOT NULL,
    "conditionFieldId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "conditionValue" TEXT,
    "actionType" TEXT NOT NULL,
    "actionTarget" TEXT NOT NULL,
    "actionValue" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldRule_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VariantCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "sku" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VariantCache_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "details" TEXT,
    "shop" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Metal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "material" TEXT NOT NULL,
    "density" REAL NOT NULL,
    "pricePerGram" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StonePrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minCarat" REAL NOT NULL,
    "maxCarat" REAL NOT NULL,
    "pricePerCarat" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantCache_configHash_key" ON "VariantCache"("configHash");

-- CreateIndex
CREATE UNIQUE INDEX "Metal_material_key" ON "Metal"("material");
