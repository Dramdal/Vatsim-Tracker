# VATSIM Traffic Tracker

A real-time web application for tracking aircraft and ATC on the VATSIM network.

## Features

- Real-time aircraft tracking with flight information
- ATC coverage visualization
- Dark/Light theme support
- Airport information and METAR data
- Flight route visualization
- Search functionality for aircraft and airports

## Setup

1. Clone the repository
2. No build process required - pure HTML, CSS, and JavaScript
3. Serve the files using any web server

## Deployment

You can deploy this website using any static web hosting service:

- GitHub Pages
- Netlify
- Vercel
- Firebase Hosting
- Amazon S3

### Quick Deploy Instructions

1. **GitHub Pages:**
   - Push the code to a GitHub repository
   - Go to Settings > Pages
   - Select your branch and save

2. **Netlify:**
   - Connect your GitHub repository
   - Select the repository
   - Deploy

3. **Vercel:**
   - Import your GitHub repository
   - Configure project
   - Deploy

## Development

- `index.html` - Main HTML file
- `styles.css` - Styles and themes
- `script.js` - Application logic

## APIs Used

- VATSIM Data API (v3)
- VATSIM METAR API

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance

- Limited to 1000 aircraft markers for optimal performance
- 3-second update interval
- Automatic cleanup on page unload

## License

MIT License 