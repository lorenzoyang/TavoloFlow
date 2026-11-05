# Demo dish images / 演示菜品图片

These twelve photographs were generated for the fictional Demo Ramen restaurant using the built-in OpenAI `image_gen` tool on 2026-11-04. They are AI-generated illustrations, not photographs of food served by a real restaurant. No stock photography or third-party restaurant branding was used.

这十二张菜品图于 2026-11-04 使用 OpenAI 内置 `image_gen` 工具生成，用于虚构的 Demo Ramen 餐厅，不代表真实餐厅供应的食物。

The exact prompt set is in [image-prompts.json](../image-prompts.json). The first entry is the complete tonkotsu prompt; each subsequent prompt substitutes its subject into the shared template. Images were generated individually and visually checked together, then normalized through the application's existing `MenuImages.EncodeAsync` pipeline into 640×640 WebP without metadata. Only the final compressed assets are required by the demo.

完整提示词见 [image-prompts.json](../image-prompts.json)。每道菜分别生成，再统一检查，并通过应用现有图片处理流程转换为去除元数据的 640×640 WebP。Demo 直接导入这些文件，无需 API Key 或在线生成服务。

The fixture menu contains the corresponding fictional recipes and example allergens. The image generator is not used to determine allergen information.
